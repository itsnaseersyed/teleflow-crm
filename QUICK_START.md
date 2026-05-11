## 🚀 SMART LEAD DISTRIBUTION SYSTEM - QUICK START

### For Admins

#### Step 1: Import Leads
```
1. Go to: /app/import-leads
2. Click upload area or drag-drop CSV
3. CSV format: customer_name, mobile_number, city, interested_service, priority, remarks
4. Review preview
5. Click "Import Leads"
6. Check import summary
```

#### Step 2: Assign Leads
```
1. Go to: /app/lead-assignment
2. View unassigned leads
3. Option A - Single Assign: Click send icon on each lead
4. Option B - Bulk Assign: 
   - Check leads (top checkbox selects all)
   - Click "Assign X Leads" button
   - Select telecaller
   - Confirm
5. View statistics at top
```

#### Step 3: Monitor Dashboard
```
1. Go to: /app/dashboard
2. View metrics:
   - Telecallers count
   - Total leads
   - Unassigned (⚠️ priority!)
   - Assigned ✓
   - Converted 💰
3. See charts for team performance
```

---

### For Telecallers

#### Daily Workflow
```
1. Login
2. Click "My Leads" in sidebar
3. See your queue: "Lead 1 of 50"
4. Click lead card to open
5. Review customer details (name, phone, city, service, notes)
6. Review last call status (if exists)
7. Click "Call Now" button
8. Make the call
9. After call ended:
   - Select call status (Interested, Follow-Up, Converted, etc.)
   - Add notes if needed
   - Pick follow-up date if needed
   - Click "Save & Next"
10. ✨ Automatic next lead loads!
11. REPEAT for next lead
```

#### Navigation
- **Previous/Next Buttons**: Quick navigation without going back
- **Queue Progress**: Always see "Lead X of Y"
- **Upcoming Leads**: See next 3 leads in queue

---

### CSV Format Reference

#### Required Columns
```
customer_name (text)
mobile_number (10-13 digits)
```

#### Optional Columns
```
city (text)
interested_service (text)
priority (High/Medium/Low)
remarks (text)
```

#### Example CSV
```csv
customer_name,mobile_number,city,interested_service,priority,remarks
Rajesh Kumar,9876543210,Mumbai,Web Development,High,Ready to join
Priya Singh,9765432109,Delhi,Mobile App,Medium,Call after 3 PM
Amit Patel,98654310 98,Bangalore,Data Science,Low,Needs more info
```

---

### Lead Lifecycle

```
NEW IMPORTED LEAD
        ↓
    Unassigned
        ↓
(Admin assigns)
        ↓
    Assigned  ← Telecaller sees in queue
        ↓
(Telecaller clicks Call Now)
        ↓
   In Progress  ← Call is active
        ↓
(Telecaller saves after call)
        ↓
   ┌─────────────────────┐
   │ Based on call status│
   ├─────────────────────┤
   │ Interested → In Progress
   │ Follow-Up → Follow-Up  
   │ Converted → Completed ✓
   │ Not Interested → Not Interested ✓
   └─────────────────────┘
```

---

### Call Status Quick Reference

| Status | Meaning | Lead Status |
|--------|---------|---|
| **Interested** | Customer interested | In Progress |
| **Follow-Up Needed** | Needs callback | Follow-Up |
| **Not Interested** | Rejected | Not Interested |
| **Busy** | Will call later | In Progress |
| **No Response** | Phone didn't ring | In Progress |
| **Switched Off** | Phone off | Not Interested |
| **Converted** | Deal closed! 🎉 | Completed |
| **Invalid Number** | Wrong number | Not Interested |

---

### Dashboard Metrics

#### Admin Dashboard
- **Telecallers**: Total team members
- **Total Leads**: All leads in system
- **Unassigned**: ⚠️ Means more work for you!
- **Assigned**: Distributed to team
- **Converted**: Revenue 💰

#### Telecaller Dashboard
- **My Queue**: Your total assigned leads
- **Completed Today**: Finished today
- **Converted Today**: Closed deals today 🎉
- **Calls Today**: Total calls made
- **Pending Follow-ups**: Callbacks needed

---

### Keyboard Shortcuts
*(Optional - not yet implemented)*

```
Ctrl/Cmd + N = Next lead
Ctrl/Cmd + P = Previous lead  
Ctrl/Cmd + S = Save call
Ctrl/Cmd + I = Import leads (admin)
```

---

### Troubleshooting

❌ **"No leads in my queue"**
- Admin hasn't assigned leads yet
- Ask your manager to assign from Lead Assignment page

❌ **"Mobile number invalid"**
- Must be 10-13 digits
- Remove country codes, dashes, spaces
- Example: 9876543210 ✓ (not +91-98765-43210)

❌ **"Duplicate rows in import"**
- Same mobile number already in system
- System won't double-add
- Will be counted in statistics

❌ **"Can't assign leads"**
- Admin feature only
- Only admins can access /lead-assignment page
- Make sure telecallers exist in system

---

### Tips for Best Performance

✅ **For Admins:**
1. Import leads in batches of 100-500
2. Assign evenly to all telecallers
3. Monitor dashboards regularly
4. Check unassigned count weekly

✅ **For Telecallers:**
1. Keep notes concise and specific
2. Set follow-ups immediately for interested leads
3. Update status before moving to next lead
4. Use priority to focus on high-value leads
5. Time yourself - aim for <5 mins per lead

---

### Getting Help

📖 **Full Documentation**: See `SMART_LEAD_DISTRIBUTION_SYSTEM.md`

📁 **Key Files**:
- `src/routes/_app.import-leads.tsx` - Import page
- `src/routes/_app.lead-assignment.tsx` - Assignment page
- `src/routes/_app.my-leads.tsx` - Telecaller queue
- `src/routes/_app.lead.$leadId.call.tsx` - Call screen
- `src/lib/csv-utils.ts` - CSV utilities

---

### Next Steps

1. [ ] Create admin account
2. [ ] Create 2-3 telecaller accounts  
3. [ ] Prepare CSV with leads
4. [ ] Import via admin panel
5. [ ] Assign to telecallers
6. [ ] Start making calls!

---

**Ready? Let's make some calls! 📞**
