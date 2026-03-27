/**
 * Seed two Finished orders for a buyer user to test renter reviews (no Stripe, no settlement).
 *
 * - Buyer: BUYER_EMAIL (default: seller.test@opeec.app)
 * - Picks two Active equipments NOT owned by that user (different owners when possible)
 * - Sets rental_status Finished, buyer_review rating 0 (eligible to rate in app)
 *
 * Usage (from repo root, with .env MONGO_URI):
 *   node scripts/seedFinishedOrdersForBuyer.js
 *   BUYER_EMAIL=other@example.com node scripts/seedFinishedOrdersForBuyer.js
 *
 * Optional:
 *   node scripts/seedFinishedOrdersForBuyer.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/user');
const Equipment = require('../models/equipment');
const Order = require('../models/orders');
const { calculateOrderFees } = require('../utils/feeCalculations');

const MONGO_URI = process.env.MONGO_URI;
const BUYER_EMAIL = (process.env.BUYER_EMAIL || 'seller.test@opeec.app').trim().toLowerCase();
const DRY_RUN = process.argv.includes('--dry-run');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pick up to `count` equipments owned by someone other than buyerId, preferring distinct owners.
 */
async function pickEquipmentsForBuyer(buyerId, count = 2) {
  const candidates = await Equipment.find({
    ownerId: { $ne: buyerId },
    equipment_status: 'Active',
  })
    .select('_id name ownerId rental_price equipment_price')
    .lean();

  if (candidates.length < count) {
    throw new Error(
      `Need at least ${count} Active equipment rows not owned by buyer; found ${candidates.length}.`
    );
  }

  const picked = [];
  const usedOwners = new Set();

  for (const eq of candidates) {
    if (picked.length >= count) break;
    const oid = eq.ownerId?.toString();
    if (picked.length === 0 || !usedOwners.has(oid) || picked.length === count - 1) {
      picked.push(eq);
      usedOwners.add(oid);
    }
  }

  if (picked.length < count) {
    picked.length = 0;
    usedOwners.clear();
    for (const eq of candidates) {
      if (picked.length >= count) break;
      picked.push(eq);
    }
  }

  return picked.slice(0, count);
}

function buildOrderPayload({ buyerId, equipment, fees, rentalFee, rentalDays }) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (rentalDays + 3));
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() - 3);

  return {
    userId: buyerId,
    equipmentId: equipment._id,
    rental_schedule: { start_date: startDate, end_date: endDate },
    renter_timezone: 'America/Toronto',
    location: {
      address: 'Test address — seeded order for review QA',
      lat: 43.6532,
      lng: -79.3832,
    },
    rental_fee: rentalFee,
    platform_fee: fees.platform_fee,
    tax_amount: fees.tax_amount,
    insurance_amount: fees.insurance_amount,
    deposit_amount: fees.deposit_amount || 0,
    total_amount: fees.total_amount,
    subtotal: fees.subtotal,
    security_option: { insurance: true },
    cancellation: { is_cancelled: false },
    rental_status: 'Finished',
    return_status: { is_returned: true, returned_at: now },
    owner_images: [],
    buyer_images: [],
    penalty_apply: false,
    penalty_amount: 0,
    status_change_timestamp: now,
    buyer_review: {
      rating: 0,
      comment: '',
      reviewed_at: null,
    },
    stripe_payout: {
      payment_intent_id: '',
      transfer_id: '',
      transfer_status: 'pending',
      transfer_amount: 0,
      transfer_triggered_at: null,
      transfer_completed_at: null,
      transfer_failure_reason: '',
      destination_account_id: '',
    },
    stripe_payment: {
      payment_intent_id: '',
      payment_method_id: '',
      customer_id: '',
      payment_status: 'succeeded',
      amount_captured: fees.total_amount,
      payment_captured_at: now,
      refund_id: '',
      refund_amount: 0,
      refund_status: '',
      refund_processed_at: null,
      late_penalty_charges: [],
    },
  };
}

async function main() {
  if (!MONGO_URI) {
    console.error('Missing MONGO_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  });
  console.log('Connected to MongoDB\n');

  try {
    const buyer = await User.findOne({
      email: new RegExp(`^${escapeRegex(BUYER_EMAIL)}$`, 'i'),
    }).select('_id name email stripe_customer_id');

    if (!buyer) {
      throw new Error(`No user found with email: ${BUYER_EMAIL}`);
    }

    console.log(`Buyer: ${buyer.name} <${buyer.email}> (${buyer._id})`);

    const equipments = await pickEquipmentsForBuyer(buyer._id, 2);
    console.log(
      'Equipment:',
      equipments.map((e) => `${e.name} (${e._id}) owner=${e.ownerId}`).join('\n          ')
    );

    const rentalDays = 2;
    const createdIds = [];

    for (let i = 0; i < equipments.length; i++) {
      const equipment = equipments[i];
      const daily = Number(equipment.rental_price) > 0 ? Number(equipment.rental_price) : 25;
      const rentalFee = Math.round(daily * rentalDays * 100) / 100;
      const equipmentValue = Number(equipment.equipment_price) > 0 ? Number(equipment.equipment_price) : 800;

      const fees = await calculateOrderFees(rentalFee, true, rentalDays, equipmentValue);
      const owner = await User.findById(equipment.ownerId).select('stripe_connect.account_id').lean();
      const destination = owner?.stripe_connect?.account_id || '';

      const doc = buildOrderPayload({
        buyerId: buyer._id,
        equipment,
        fees,
        rentalFee,
        rentalDays,
      });
      doc.stripe_payout.destination_account_id = destination;

      if (DRY_RUN) {
        console.log(`\n[DRY-RUN] Would insert order for equipment ${equipment.name} total=$${fees.total_amount}`);
        continue;
      }

      const order = new Order(doc);
      await order.save();
      createdIds.push(order._id.toString());
      console.log(`\nCreated Finished order ${order._id} — equipment "${equipment.name}" — total $${fees.total_amount}`);
    }

    if (DRY_RUN) {
      console.log('\nDry run complete; no writes.');
    } else {
      console.log('\n---');
      console.log('Done. In the app: History → Finished as renter → open each order → Rate experience.');
      console.log('Order IDs:', createdIds.join(', '));
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
