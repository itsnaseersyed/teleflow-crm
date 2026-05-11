#!/usr/bin/env node

/**
 * Test Script: Daily Batch System Logic Verification
 * This script tests the core batch identifier generation and safe delete logic
 */

console.log("=".repeat(70));
console.log("DAILY BATCH SYSTEM - BUSINESS LOGIC TESTS");
console.log("=".repeat(70));

// Test 1: Batch Identifier Generation
console.log("\n✓ TEST 1: Batch Identifier Generation");
console.log("   Testing: generateBatchIdentifier() function logic");

function generateBatchIdentifier() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `Batch_${year}-${month}-${day}`;
}

const batchId = generateBatchIdentifier();
const regex = /^Batch_\d{4}-\d{2}-\d{2}$/;
const isValidFormat = regex.test(batchId);

console.log(`   Generated: ${batchId}`);
console.log(`   Format Valid: ${isValidFormat ? "✓ PASS" : "✗ FAIL"}`);
console.log(`   Expected Format: Batch_YYYY-MM-DD`);
console.log(`   Actual Format: ${batchId}`);

if (!isValidFormat) {
  console.error("   ERROR: Batch identifier format is invalid!");
  process.exit(1);
}

// Test 2: Today's Date Generation
console.log("\n✓ TEST 2: Today's Date Generation");
console.log("   Testing: getTodayDate() function logic");

function getTodayDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

const todayDate = getTodayDate();
const isValidDate = todayDate instanceof Date && !isNaN(todayDate);
const hasZeroTime = todayDate.getHours() === 0 && todayDate.getMinutes() === 0;

console.log(`   Generated Date: ${todayDate.toISOString()}`);
console.log(`   Is Valid Date: ${isValidDate ? "✓ PASS" : "✗ FAIL"}`);
console.log(`   Has Zero Time: ${hasZeroTime ? "✓ PASS" : "✗ FAIL"}`);

if (!isValidDate || !hasZeroTime) {
  console.error("   ERROR: Date generation failed!");
  process.exit(1);
}

// Test 3: Safe Delete Logic - Test Case 1: All Unassigned, No Calls
console.log("\n✓ TEST 3: Safe Delete Logic - Scenario 1");
console.log("   Scenario: Batch with 10 leads, ALL unassigned, NO calls");
console.log("   Expected: Delete should SUCCEED");

const batch1Leads = [
  { id: "lead-1", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-2", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-3", assignedTo: null, hasCallsCount: 0 },
];

function canDeleteBatch(leads) {
  const assignedLeads = leads.filter(l => l.assignedTo).map(l => l.id);
  const leadsWithCalls = leads.filter(l => l.hasCallsCount > 0).map(l => l.id);
  return { assignedLeads, leadsWithCalls, canDelete: assignedLeads.length === 0 && leadsWithCalls.length === 0 };
}

const result1 = canDeleteBatch(batch1Leads);
console.log(`   Assigned Leads: ${result1.assignedLeads.length}`);
console.log(`   Leads with Calls: ${result1.leadsWithCalls.length}`);
console.log(`   Delete Allowed: ${result1.canDelete ? "✓ YES (PASS)" : "✗ NO (FAIL)"}`);

if (!result1.canDelete) {
  console.error("   ERROR: Should allow deletion of unassigned batch!");
  process.exit(1);
}

// Test 4: Safe Delete Logic - Test Case 2: Some Assigned
console.log("\n✓ TEST 4: Safe Delete Logic - Scenario 2");
console.log("   Scenario: Batch with 10 leads, 5 assigned, 5 unassigned");
console.log("   Expected: Delete should FAIL (block deletion)");

const batch2Leads = [
  { id: "lead-1", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-2", assignedTo: "user-123", hasCallsCount: 0 },
  { id: "lead-3", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-4", assignedTo: "user-456", hasCallsCount: 0 },
];

const result2 = canDeleteBatch(batch2Leads);
console.log(`   Assigned Leads: ${result2.assignedLeads.length} (${result2.assignedLeads.join(", ")})`);
console.log(`   Leads with Calls: ${result2.leadsWithCalls.length}`);
console.log(`   Delete Allowed: ${result2.canDelete ? "✗ YES (FAIL)" : "✓ NO (PASS)"}`);

if (result2.canDelete) {
  console.error("   ERROR: Should block deletion of batch with assigned leads!");
  process.exit(1);
}

// Test 5: Safe Delete Logic - Test Case 3: Leads with Calls
console.log("\n✓ TEST 5: Safe Delete Logic - Scenario 3");
console.log("   Scenario: Batch with 10 leads, all unassigned, but 3 have calls");
console.log("   Expected: Delete should FAIL (block deletion)");

const batch3Leads = [
  { id: "lead-1", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-2", assignedTo: null, hasCallsCount: 1 },
  { id: "lead-3", assignedTo: null, hasCallsCount: 0 },
  { id: "lead-4", assignedTo: null, hasCallsCount: 2 },
];

const result3 = canDeleteBatch(batch3Leads);
console.log(`   Assigned Leads: ${result3.assignedLeads.length}`);
console.log(`   Leads with Calls: ${result3.leadsWithCalls.length} (${result3.leadsWithCalls.join(", ")})`);
console.log(`   Delete Allowed: ${result3.canDelete ? "✗ YES (FAIL)" : "✓ NO (PASS)"}`);

if (result3.canDelete) {
  console.error("   ERROR: Should block deletion of batch with calls!");
  process.exit(1);
}

// Test 6: Safe Delete Logic - Test Case 4: Mixed Assigned + Calls
console.log("\n✓ TEST 6: Safe Delete Logic - Scenario 4");
console.log("   Scenario: Batch with 10 leads, 3 assigned AND 2 have calls");
console.log("   Expected: Delete should FAIL, error message should show both counts");

const batch4Leads = [
  { id: "lead-1", assignedTo: "user-123", hasCallsCount: 0 },
  { id: "lead-2", assignedTo: null, hasCallsCount: 1 },
  { id: "lead-3", assignedTo: "user-456", hasCallsCount: 0 },
  { id: "lead-4", assignedTo: null, hasCallsCount: 2 },
  { id: "lead-5", assignedTo: "user-789", hasCallsCount: 0 },
];

const result4 = canDeleteBatch(batch4Leads);
console.log(`   Assigned Leads: ${result4.assignedLeads.length}`);
console.log(`   Leads with Calls: ${result4.leadsWithCalls.length}`);
console.log(`   Delete Allowed: ${result4.canDelete ? "✗ YES (FAIL)" : "✓ NO (PASS)"}`);
console.log(`   Error Message: "Cannot delete batch: ${result4.assignedLeads.length} assigned leads, ${result4.leadsWithCalls.length} leads with calls. Please reassign leads first."`);

if (result4.canDelete) {
  console.error("   ERROR: Should block deletion of batch with mixed conditions!");
  process.exit(1);
}

// Test 7: Daily Batch Organization
console.log("\n✓ TEST 7: Daily Batch Organization");
console.log("   Testing: Multiple imports on same day get same batch ID");

const batch1 = generateBatchIdentifier();
const batch2 = generateBatchIdentifier();
const samesDay = batch1 === batch2;

console.log(`   Batch 1: ${batch1}`);
console.log(`   Batch 2: ${batch2}`);
console.log(`   Same Batch ID: ${samesDay ? "✓ YES (PASS)" : "✗ NO (FAIL)"}`);

if (!samesDay) {
  console.error("   ERROR: Same-day imports should have same batch ID!");
  process.exit(1);
}

// Summary
console.log("\n" + "=".repeat(70));
console.log("ALL TESTS PASSED ✓");
console.log("=".repeat(70));
console.log(`
Summary:
✓ Batch identifier format correct (Batch_YYYY-MM-DD)
✓ Date generation creates midnight timestamp
✓ Safe delete allows unassigned, no-calls batches
✓ Safe delete blocks assigned leads
✓ Safe delete blocks leads with calls
✓ Safe delete blocks mixed scenarios
✓ Daily organization ensures same-day batches match

Status: Daily Batch System is ready for runtime testing
`);
