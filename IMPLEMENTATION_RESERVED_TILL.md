# Reserved Till Feature Implementation

## Overview
Added `reserved_till` field to all equipment list APIs to show when equipment is currently reserved/rented. The field shows text like "Reserved till 05:00 - 12/07/25" or empty string if not reserved.

## Implementation Details

### 1. Helper Function Added
Created `getReservationText(equipmentId)` helper function in `controllers/equipment.js` (line 78-113):

**Logic:**
- Checks for active orders with statuses: 'Booked', 'Delivered', 'Ongoing', 'Late'
- Retrieves the rental end date from the order's `rental_schedule.end_date`
- Formats as: `"Reserved till HH:MM - DD/MM/YY"`
- Returns empty string `""` if equipment is not currently reserved

**Example outputs:**
- Reserved: `"Reserved till 05:00 - 12/07/25"`
- Available: `""`

### 2. APIs Updated

All equipment listing APIs now include the `reserved_till` field:

#### User/Mobile APIs:
1. **`getAllEquipments`** - Browse all available equipment
   - Line ~431 & ~497: Added `reserved_till` field

2. **`getMyEquipments`** - Owner's equipment list  
   - Line ~593: Added `reserved_till` field

3. **`getFavoriteEquipments`** - User's favorites
   - Line ~1078: Added `reserved_till` field

4. **`getUserShop`** - Shop view with all seller's equipment
   - Line ~970: Added `reserved_till` field

5. **`getEquipmentDetails`** - Individual equipment details
   - Line ~700: Added `reserved_till` field

#### Admin APIs:
6. **`getEquipmentByStatus`** - Admin equipment management
   - Line ~1302: Added `reserved_till` field

7. **`searchEquipment`** - Admin equipment search
   - Line ~1393: Added `reserved_till` field

### 3. Response Format

Every equipment object in list responses now includes:

```json
{
  "_id": "...",
  "name": "Rotary Tool",
  "rental_price": 54,
  "images": [...],
  "location": {...},
  "reserved_till": "Reserved till 05:00 - 12/07/25",  // ← NEW FIELD
  // ... other fields
}
```

**When Equipment is Available:**
```json
{
  "reserved_till": ""  // Empty string
}
```

**When Equipment is Reserved:**
```json
{
  "reserved_till": "Reserved till 14:30 - 25/12/25"  // Shows end date/time
}
```

## Date Format Explanation

Format: `"Reserved till HH:MM - DD/MM/YY"`

- **HH:MM**: 24-hour time (e.g., 05:00, 14:30, 23:45)
- **DD/MM/YY**: Day/Month/Year (e.g., 12/07/25 = July 12, 2025)

## Active Rental Statuses

Equipment is considered "reserved" when it has an active order with status:
- **Booked**: Order placed, waiting for delivery
- **Delivered**: Equipment delivered to renter
- **Ongoing**: Rental period active
- **Late**: Rental period exceeded, not yet returned

Equipment is considered "available" when:
- No active orders exist
- All orders are: Cancelled, Finished, or Returned

## Testing Recommendations

1. **Test with reserved equipment**: Create an order and verify the text shows correctly
2. **Test with available equipment**: Verify empty string is returned
3. **Test date formatting**: Verify various dates/times display correctly
4. **Test all APIs**: Ensure all 7 updated endpoints work properly
5. **Test edge cases**: Equipment with multiple orders (should show latest end date)

## Performance Considerations

- The helper function performs one database query per equipment item
- Query is optimized with `.select()` to only fetch end_date
- Sorted by end_date descending to get latest reservation
- All implementations use `Promise.all()` for parallel processing

## Mobile App Integration

The mobile app can now:
1. Display reservation status on equipment cards
2. Show empty string when equipment is available
3. Show formatted text like "Reserved till 05:00 - 12/07/25" when reserved
4. Use this to prevent booking attempts on reserved equipment (UI-level)

## Files Modified

- `controllers/equipment.js`: 
  - Added `getReservationText()` helper function
  - Updated 7 equipment list/details APIs with `reserved_till` field

## No Database Changes Required

This feature uses existing data:
- `Order` model: `rental_schedule.end_date` and `rental_status` fields
- No schema changes needed
- Backward compatible with existing mobile app versions (they'll just ignore the new field)


