# Daily Batch Management System - Runtime Testing Checklist

## ✓ Completed Tests
- [x] TypeScript Compilation: **PASS** - No errors
- [x] Business Logic Tests: **PASS** - 7/7 scenarios verified
  - Batch identifier generation (format: Batch_YYYY-MM-DD)
  - Date generation (midnight UTC)
  - Safe delete blocks assigned leads
  - Safe delete blocks leads with calls
  - Mixed scenario handling
  - Daily organization (same-day imports)

## Manual Runtime Testing (To Be Performed)

### Test A: Import Flow - Batch Identifier Creation
**Objective**: Verify CSV import creates batch with correct identifier format

**Steps**:
1. Navigate to Import Leads page (`http://localhost:3001/import-leads`)
2. Create or download sample CSV with 10 leads
3. Upload CSV file
4. Verify:
   - Import completes successfully
   - Recent Imports table shows batch with identifier in format `Batch_YYYY-MM-DD`
   - Batch identifier appears in blue (#2563eb color)
   - Status badge shows "Active" (green)
   - Assigned count shows "0"

**Expected Result**: 
```
Batch ID           Files         Imported   Assigned   Status
Batch_2026-05-11   test.csv      10         0          Active ✓
```

---

### Test B: Delete Protection - Verify Safe Delete Logic
**Objective**: Ensure batch with assigned leads cannot be deleted

**Steps**:
1. From Import Leads page, locate the batch created in Test A
2. Click delete button (trash icon)
3. **Scenario B1: Fresh batch (no assignments)**
   - Expected: Shows confirmation "Are you sure you want to archive this batch?"
   - Click OK to archive
   - Expected: Batch status changes to "Archived" (gray badge)

**Steps for Scenario B2** (run on separate import):
1. Import new CSV with 20 leads
2. Go to Lead Assignment page (`http://localhost:3001/lead-assignment`)
3. Using Quick Select, select 15 leads
4. Use Smart Distribution to assign 15 leads to 3 telecallers
5. Return to Import Leads page
6. Click delete button on the batch with assigned leads
7. **Expected Warning Dialog**:
   ```
   ⚠️ Warning!
   
   This batch has:
   - 15 assigned leads
   - 0 completed calls
   
   These cannot be deleted. Please reassign leads first.
   ```
8. Click OK (delete should be blocked)
9. Verify batch status still shows "Active"

---

### Test C: Delete with Call Records
**Objective**: Ensure batch with completed calls cannot be deleted

**Steps**:
1. Use batch from Test B with assigned leads
2. Go to My Leads page (`http://localhost:3001/my-leads`) as telecaller
3. Take 3-4 calls on the leads (mark completion status)
4. Return to Import Leads page
5. Click delete on the batch
6. **Expected Warning**:
   ```
   ⚠️ Warning!
   
   This batch has:
   - 15 assigned leads
   - 4 completed calls
   
   These cannot be deleted. Please reassign leads first.
   ```

---

### Test D: Multiple Daily Imports - Organization
**Objective**: Verify daily organization of batches

**Steps**:
1. Import CSV on Monday: 50 leads → Batch_2026-05-13
2. Import CSV again on Monday: 30 leads → Expected: **Same Batch_2026-05-13**
3. Verify in Recent Imports:
   ```
   Batch ID           Files    Imported   Status
   Batch_2026-05-13   file1    50         Active
   Batch_2026-05-13   file2    30         Active
   ```
4. Next day (Tuesday), import: 60 leads → Batch_2026-05-14 (Different!)

**Expected Result**: Same-day imports share batch identifier; different days get different batch IDs

---

### Test E: Archive Behavior
**Objective**: Ensure archived batches are visible but marked as completed

**Steps**:
1. Create and complete a batch workflow:
   - Import → Assign All → Make Various Call Statuses
2. Return to Import Leads → Recent Imports
3. Locate the batch with all assigned leads completed
4. Update batch status to "completed" in Firestore (via Firebase Console)
5. Verify in UI:
   - Status badge changes to "Completed" (blue)
   - Delete button still shows warning (cannot delete completed batches)

---

### Test F: Error Message Details
**Objective**: Verify error messages provide actionable information

**Steps**:
1. Create scenario: Batch with 8 assigned leads + 3 leads with calls
2. Attempt to delete
3. Verify error message shows BOTH counts:
   ```
   Cannot delete batch: 8 assigned leads, 3 leads with calls. 
   Please reassign leads first.
   ```
4. User can see exactly what needs to be resolved

---

### Test G: UI Responsiveness
**Objective**: Ensure delete dialog works smoothly

**Steps**:
1. Click delete on multiple batches rapidly
2. Verify:
   - Each dialog appears independently
   - No duplicate dialogs
   - Buttons properly disabled during operation
   - Loading state visible during mutation

---

### Test H: Type Safety
**Objective**: Verify TypeScript types work correctly

**Steps**:
1. Open DevTools Console
2. Check for any TypeScript errors: **Should see none**
3. Verify types display correctly:
   - `batch.dayIdentifier` property accessible
   - `batch.batchStatus` has type checking
   - `batch.assignedLeadsCount` displays as number

---

## Edge Cases to Verify

### Edge Case 1: Empty Batch
- Import CSV with 0 leads (if supported)
- Expected: Should allow deletion

### Edge Case 2: Partially Assigned
- Batch with 50 leads, only 3 assigned
- Expected: Delete blocked with warning showing only 3 assigned count

### Edge Case 3: Timezone Boundary
- Import near midnight
- Verify batch identifier uses correct date (current day, not next day)

### Edge Case 4: Concurrent Imports
- Two admins importing same CSV simultaneously
- Expected: Both get same batch identifier (Batch_YYYY-MM-DD)

---

## Performance Checklist

- [ ] Import with 1000 leads completes in <5 seconds
- [ ] Delete mutation with 500 leads completes in <3 seconds
- [ ] UI remains responsive during batch operations
- [ ] No memory leaks in Recent Imports table
- [ ] Batch query returns recent batches quickly (<500ms)

---

## Data Integrity Checks

After each test, verify in Firestore:

1. **Batch Document**:
   ```json
   {
     "id": "batch-123",
     "dayIdentifier": "Batch_2026-05-11",
     "batchDate": ISODate("2026-05-11T00:00:00Z"),
     "batchStatus": "active",
     "uploadedAt": <timestamp>,
     "importedRows": 50,
     "assignedLeadsCount": 15,
     "completedCallsCount": 4
   }
   ```

2. **Lead Documents** (belongs to batch):
   ```json
   {
     "uploadBatchId": "batch-123",
     "assignedTo": "telecaller-uid",
     "assignedAt": <timestamp>
   }
   ```

3. **Call Documents** (for leads in batch):
   ```json
   {
     "leadId": "lead-123",
     "createdAt": <timestamp>,
     "callStatus": "Interested"
   }
   ```

---

## Success Criteria

✓ All 8 manual tests pass
✓ No compilation errors
✓ No console warnings/errors during tests
✓ Data integrity verified in Firestore
✓ Error messages are clear and actionable
✓ UI responsiveness acceptable (<100ms latency)
✓ All edge cases handled gracefully

---

## Known Limitations / Future Enhancements

1. **Batch Metrics**: Current implementation initializes metrics but doesn't auto-update daily
   - Future: Add cron job to calculate daily metrics

2. **Archive Retrieval**: Archived batches remain in history
   - Future: Add filter to show/hide archived batches

3. **Restoration**: Cannot restore archived batches
   - Future: Add "Restore" option for archived batches

4. **Bulk Operations**: Cannot archive multiple batches at once
   - Future: Add checkbox selection for bulk archiving

---

## Quick Test Script

To quickly verify import flow:
1. Go to http://localhost:3001/import-leads
2. Download sample CSV
3. Upload it back
4. Verify batch shows with today's date identifier
5. Verify Recent Imports dialog shows correct batch ID format

Expected output in tests: "Batch_2026-05-11" (today's date)

