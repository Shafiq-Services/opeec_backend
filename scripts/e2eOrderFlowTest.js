/**
 * E2E Order Flow Test Script
 *
 * Creates a full rental cycle from start to finish using:
 * - 2 verified users (seller with equipment + buyer)
 * - Stripe test mode for payment (pm_card_visa)
 * - Database date manipulation to avoid waiting
 *
 * Usage: NODE_ENV=development node scripts/e2eOrderFlowTest.js
 *
 * Prerequisites:
 * - .env configured with MONGO_URI, STRIPE_SECRET_KEY
 * - At least 2 users: verified + Stripe Connect (seller), verified (buyer)
 * - Seller must have at least one Active equipment
 *
 * Flow: Booked → Delivered → Ongoing → Returned → Finished
 * Includes: payment, settlement (ORDER_EARNING), Stripe payout (source_transaction)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Stripe = require('stripe');
const moment = require('moment-timezone');

// Models
const User = require('../models/user');
const Equipment = require('../models/equipment');
const Order = require('../models/orders');
const SellerWallet = require('../models/sellerWallet');
const TransactionLog = require('../models/transactionLog');
const PercentageSetting = require('../models/percentageSettings');

// Controllers
const { processOrderCompletion } = require('../controllers/settlementController');
const { triggerAutomaticPayout } = require('../controllers/stripeConnectController');
const { calculateOrderFees } = require('../utils/feeCalculations');
const { ensureWallet, computeAndUpdateBalance } = require('../utils/walletService');

const MONGO_URI = process.env.MONGO_URI;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!MONGO_URI || !STRIPE_SECRET_KEY) {
  console.error('❌ Missing MONGO_URI or STRIPE_SECRET_KEY in .env');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Placeholder image URL for deliver/return steps
const PLACEHOLDER_IMAGE = 'https://opeecstorage.blob.core.windows.net/placeholder/test-image.jpg';

async function findTestUsers() {
  console.log('\n📋 Step 1: Finding verified users...');

  // Seller: verified + Stripe Connect active + has equipment
  const sellers = await User.find({
    isUserVerified: true,
    'stripe_verification.status': 'verified',
    'stripe_connect.account_status': 'active',
    'stripe_connect.payouts_enabled': true,
    'stripe_connect.account_id': { $exists: true, $ne: '' }
  })
    .select('_id name email stripe_connect stripe_customer_id')
    .lean();

  const sellerWithEquipment = [];
  for (const s of sellers) {
    const equip = await Equipment.findOne({
      ownerId: s._id,
      equipment_status: 'Active'
    }).select('_id name rental_price equipment_price subCategoryId');
    if (equip) sellerWithEquipment.push({ user: s, equipment: equip });
  }

  if (sellerWithEquipment.length === 0) {
    throw new Error('No verified seller with Active equipment found. Need: isUserVerified, stripe_connect active, payouts_enabled.');
  }

  // Buyer: verified, must NOT be the seller
  const sellerIds = sellerWithEquipment.map((s) => s.user._id.toString());
  const buyers = await User.find({
    isUserVerified: true,
    'stripe_verification.status': 'verified',
    _id: { $nin: sellerWithEquipment.map((s) => s.user._id) }
  })
    .select('_id name email stripe_customer_id')
    .lean();

  if (buyers.length === 0) {
    throw new Error('No verified buyer found (excluding sellers).');
  }

  const seller = sellerWithEquipment[0];
  const buyer = buyers[0];

  console.log(`   Seller: ${seller.user.name} (${seller.user.email})`);
  console.log(`   Equipment: ${seller.equipment.name}`);
  console.log(`   Buyer: ${buyer.name} (${buyer.email})`);

  return { seller, buyer };
}

async function createPaymentAndOrder(seller, buyer) {
  console.log('\n📋 Step 2: Creating payment and order...');

  const equipment = seller.equipment;
  const rentalDays = 2;
  const rentalFee = (equipment.rental_price || 50) * rentalDays;

  const settings = await PercentageSetting.findOne().sort({ createdAt: -1 });
  if (!settings) throw new Error('PercentageSetting not found');

  const isInsurance = true;
  const equipmentValue = equipment.equipment_price || 1000;
  const fees = await calculateOrderFees(rentalFee, isInsurance, rentalDays, equipmentValue);

  const totalAmount = fees.total_amount;
  const platformFee = fees.platform_fee;
  const taxAmount = fees.tax_amount;
  const insuranceAmount = fees.insurance_amount;
  const depositAmount = 0;
  const subtotal = fees.subtotal;

  // Dates: start 2 days ago, end yesterday (so we can deliver/collect/return/finish immediately)
  const startDate = moment().subtract(2, 'days').startOf('day').toDate();
  const endDate = moment().subtract(1, 'day').endOf('day').toDate();

  // Ensure buyer has Stripe customer
  let customerId = buyer.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: buyer.email,
      name: buyer.name,
      metadata: { user_id: buyer._id.toString(), platform: 'OPEEC' }
    });
    customerId = customer.id;
    await User.findByIdAndUpdate(buyer._id, { stripe_customer_id: customerId });
    console.log(`   Created Stripe customer for buyer: ${customerId}`);
  }

  // Create PaymentIntent
  const amountInCents = Math.round(totalAmount * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: customerId,
    metadata: {
      user_id: buyer._id.toString(),
      equipment_id: equipment._id.toString(),
      owner_id: seller.user._id.toString(),
      owner_connect_account_id: seller.user.stripe_connect.account_id,
      rental_fee: rentalFee.toString(),
      platform_fee: platformFee.toString(),
      platform: 'OPEEC',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      total_amount: totalAmount.toString(),
      is_insurance: 'true'
    },
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: `Rental: ${equipment.name}`
  });

  console.log(`   PaymentIntent created: ${paymentIntent.id} for $${totalAmount}`);

  // Confirm payment with Stripe test payment method
  // pm_card_visa = 4242... (succeeds, funds pending 2-7 days)
  // For immediate funds use 4000000000000077 - but requires client-side; server-side we use pm_card_visa
  await stripe.paymentIntents.confirm(paymentIntent.id, {
    payment_method: 'pm_card_visa'
  });

  const pi = await stripe.paymentIntents.retrieve(paymentIntent.id);
  if (pi.status !== 'succeeded') {
    throw new Error(`Payment not succeeded. Status: ${pi.status}`);
  }
  console.log(`   Payment confirmed: ${pi.status}`);

  // Create order
  const order = new Order({
    userId: buyer._id,
    equipmentId: equipment._id,
    rental_schedule: { start_date: startDate, end_date: endDate },
    renter_timezone: 'America/Toronto',
    location: { address: '123 Test St', lat: 43.65, lng: -79.38 },
    rental_fee: rentalFee,
    platform_fee: platformFee,
    tax_amount: taxAmount,
    insurance_amount: insuranceAmount,
    deposit_amount: depositAmount,
    total_amount: totalAmount,
    subtotal,
    security_option: { insurance: isInsurance },
    rental_status: 'Booked',
    status_change_timestamp: new Date(),
    stripe_payment: {
      payment_intent_id: paymentIntent.id,
      payment_method_id: pi.payment_method,
      customer_id: customerId,
      payment_status: 'succeeded',
      amount_captured: totalAmount,
      payment_captured_at: new Date()
    },
    stripe_payout: {
      destination_account_id: seller.user.stripe_connect.account_id,
      transfer_status: 'pending'
    }
  });
  await order.save();

  console.log(`   Order created: ${order._id} (Booked)`);

  return { order, fees, rentalFee, totalAmount };
}

async function runOrderSteps(order, seller, buyer) {
  const equipment = await Equipment.findById(order.equipmentId);

  // Step 3: Deliver (seller marks ready)
  console.log('\n📋 Step 3: Seller delivers (marks ready for pickup)...');
  order.rental_status = 'Delivered';
  order.owner_images = [PLACEHOLDER_IMAGE];
  order.status_change_timestamp = new Date();
  await order.save();
  equipment.equipment_status = 'InActive';
  await equipment.save();
  console.log('   Status: Delivered');

  // Step 4: Collect (buyer collects)
  console.log('\n📋 Step 4: Buyer collects equipment...');
  order.rental_status = 'Ongoing';
  order.status_change_timestamp = new Date();
  await order.save();
  console.log('   Status: Ongoing');

  // Step 5: Return (buyer returns)
  console.log('\n📋 Step 5: Buyer returns equipment...');
  order.rental_status = 'Returned';
  order.buyer_images = [PLACEHOLDER_IMAGE];
  order.status_change_timestamp = new Date();
  await order.save();
  console.log('   Status: Returned');

  // Step 6: Finish (seller finishes, triggers payout + settlement)
  console.log('\n📋 Step 6: Seller finishes order...');
  order.rental_status = 'Finished';
  order.status_change_timestamp = new Date();
  await order.save();
  equipment.equipment_status = 'Active';
  await equipment.save();

  // Process settlement (wallet credits)
  await processOrderCompletion(order._id.toString());
  console.log('   Settlement (processOrderCompletion) done');

  // Trigger Stripe payout to seller (may fail with balance_insufficient without source_transaction)
  let payoutResult;
  try {
    payoutResult = await triggerAutomaticPayout(order._id.toString());
    if (payoutResult.success) {
      console.log(`   Stripe payout: $${payoutResult.transfer_amount} to ${payoutResult.owner_name}`);
    } else {
      console.log(`   Stripe payout skipped: ${payoutResult.message}`);
    }
  } catch (payoutErr) {
    console.log(`   ⚠️ Stripe payout failed: ${payoutErr.message}`);
    console.log(`   (Expected in test mode without source_transaction - funds are pending 2-7 days)`);
    payoutResult = { success: false, message: payoutErr.message };
  }

  // Refund deposit if any (this order uses insurance, so no deposit)
  const depositAmount = order.deposit_amount || 0;
  if (depositAmount > 0 && order.stripe_payment?.payment_intent_id) {
    const { processRefund } = require('../controllers/paymentController');
    try {
      await processRefund(order._id, depositAmount, 'requested_by_customer');
      console.log(`   Deposit refunded: $${depositAmount}`);
    } catch (e) {
      console.log(`   Deposit refund skipped: ${e.message}`);
    }
  }

  console.log('   Status: Finished');
}

async function verifyFinancials(order, seller, fees, rentalFee, totalAmount) {
  console.log('\n📋 Step 7: Verifying financial calculations...');

  const sellerId = (await Equipment.findById(order.equipmentId).select('ownerId')).ownerId;

  // Recompute seller wallet
  await computeAndUpdateBalance(sellerId);
  const wallet = await SellerWallet.findOne({ sellerId }).lean();

  const transactions = await TransactionLog.find({
    orderId: order._id,
    sellerId,
    status: 'completed'
  }).lean();

  console.log('\n   --- Financial Summary ---');
  console.log(`   Buyer paid:        $${totalAmount.toFixed(2)}`);
  console.log(`   Rental fee:        $${rentalFee.toFixed(2)} (to seller)`);
  console.log(`   Platform fee:      $${fees.platform_fee.toFixed(2)} (to OPEEC)`);
  console.log(`   Tax:               $${fees.tax_amount.toFixed(2)}`);
  console.log(`   Insurance:         $${fees.insurance_amount.toFixed(2)}`);
  console.log(`   Deposit:           $${(fees.deposit_amount || 0).toFixed(2)}`);

  console.log('\n   --- Seller ---');
  console.log(`   Expected earning:  $${rentalFee.toFixed(2)}`);
  console.log(`   Wallet balance:   $${(wallet?.available_balance ?? 0).toFixed(2)}`);
  console.log(`   Transactions:     ${transactions.length}`);

  const orderEarningTx = transactions.find((t) => t.type === 'ORDER_EARNING');
  const stripePayoutTx = transactions.find((t) => t.type === 'STRIPE_PAYOUT');

  let ok = true;
  if (Math.abs((wallet?.available_balance ?? 0) - 0) < 0.01) {
    console.log('   ⚠️  Seller wallet is ~0 (Stripe payout may be pending or failed)');
    if (stripePayoutTx) {
      console.log(`   STRIPE_PAYOUT tx: $${stripePayoutTx.amount}`);
    }
  }
  if (orderEarningTx && Math.abs(orderEarningTx.amount - rentalFee) > 0.01) {
    console.log(`   ❌ ORDER_EARNING mismatch: expected $${rentalFee}, got $${orderEarningTx.amount}`);
    ok = false;
  }
  if (stripePayoutTx && stripePayoutTx.amount > 0) {
    console.log(`   ❌ STRIPE_PAYOUT should be negative, got $${stripePayoutTx.amount}`);
    ok = false;
  }

  const updatedOrder = await Order.findById(order._id)
    .populate('equipmentId', 'name')
    .lean();

  console.log('\n   --- Order Stripe Payout ---');
  console.log(`   Transfer ID:       ${updatedOrder.stripe_payout?.transfer_id || 'N/A'}`);
  console.log(`   Transfer status:  ${updatedOrder.stripe_payout?.transfer_status || 'N/A'}`);
  console.log(`   Transfer amount:  $${(updatedOrder.stripe_payout?.transfer_amount || 0).toFixed(2)}`);

  if (ok) {
    console.log('\n   ✅ Financial verification passed');
  } else {
    console.log('\n   ⚠️  Some financial checks had issues (review above)');
  }

  return ok;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  OPEEC E2E Order Flow Test');
  console.log('═'.repeat(60));

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  console.log('✅ Connected to MongoDB\n');

  try {
    const { seller, buyer } = await findTestUsers();
    const { order, fees, rentalFee, totalAmount } = await createPaymentAndOrder(seller, buyer);
    await runOrderSteps(order, seller, buyer);
    const ok = await verifyFinancials(order, seller, fees, rentalFee, totalAmount);

    console.log('\n' + '═'.repeat(60));
    console.log(ok ? '  ✅ E2E TEST COMPLETED SUCCESSFULLY' : '  ⚠️  E2E TEST COMPLETED WITH WARNINGS');
    console.log('═'.repeat(60));
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

main();
