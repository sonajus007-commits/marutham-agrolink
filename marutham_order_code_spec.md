# Marutham Agrolink — Order & Return Code Specification

This document defines the human-readable codes for orders and returns, and contains the exact instruction to give Claude Code when building it.

---

## The format

**Order code:**

```
ORD + <districtCode> + YYMMDD + <6-digit daily sequence>
Example:  ORDPDK250626000001
          │   │   │      │
          │   │   │      └─ 6-digit sequence, resets to 000001 each day, per district
          │   │   └─ date the order was placed (YYMMDD)
          │   └─ 3-letter district code (Pudukkottai = PDK)
          └─ fixed prefix "ORD"
```

**Return code:**

```
RET + <districtCode> + YYMMDD + <6-digit daily sequence>
Example:  RETPDK250626000001
```

---

## The rules

1. **District code** = a 3-letter code from a `district -> code` lookup table.
   - Start with: **Pudukkottai = PDK**.
   - Built so new districts can be added easily later.

2. **Order's district code** comes from the **logged-in consumer's district at the time of ordering**.

3. **Return's district code and date context are INHERITED from the original order** the return is linked to. Every return must reference its parent order. Returns keep their **own** RET daily sequence (separate from orders).

4. **Daily reset:** the 6-digit sequence is counted **per district, per day**.
   - First order in PDK on a given date = `000001`, next = `000002`, etc.
   - Next day, it resets to `000001` again.
   - Returns have their own independent per-district daily counter.

5. **Uniqueness (critical):** the sequence must be generated **safely/atomically** so that two orders (or two returns) in the same district on the same day can **NEVER** get a duplicate number — even if created at the exact same instant. (Implemented via a counters table with row locking, or a database sequence — Claude Code should explain its method.)

6. **Overflow safety:** pad to 6 digits normally (`000001`–`999999`). If a district ever exceeds 999,999 in one day, the number **grows to 7+ digits** rather than rolling over or duplicating. A code must **never** repeat.

7. **No HHMM in the code.** The exact creation time is already stored separately in `created_at` (down to the second). The code stays clean and readable; precise time lives in the data.

---

## Exact instruction to paste into Claude Code

```
Implement human-readable codes for orders and returns in my backend.

FORMAT:
- Order:  ORD + <districtCode> + YYMMDD + 6-digit daily sequence   (e.g. ORDPDK250626000001)
- Return: RET + <districtCode> + YYMMDD + 6-digit daily sequence   (e.g. RETPDK250626000001)

RULES:
1. districtCode is a 3-letter code from a district->code lookup. Start with Pudukkottai = PDK. Make it easy to add more districts later.
2. For an ORDER, districtCode comes from the logged-in consumer's district at the time of ordering.
3. For a RETURN, districtCode and the date come from the ORIGINAL ORDER it is linked to (a return must reference its order). Returns keep their own separate RET daily sequence.
4. The 6-digit sequence RESETS DAILY, counted PER DISTRICT PER DAY (first = 000001). Returns have their own per-district daily counter.
5. CRITICAL: generate the sequence atomically so two orders/returns in the same district on the same day can NEVER get a duplicate, even at the same instant. Explain exactly how you guarantee this (counters table with locking, or a DB sequence).
6. OVERFLOW: pad to 6 digits (000001-999999). If a district ever exceeds 999,999 in one day, let the number grow to 7+ digits rather than roll over. A code must NEVER repeat.
7. Do NOT put time (HHMM) in the code. Keep created_at as the exact timestamp separately.

AFTER BUILDING:
- Create two test orders in Pudukkottai on the same day. Show me their codes in Supabase (expect ...000001 and ...000002).
- Create a return linked to one of those orders. Show me its RET code and confirm it references the correct order.
- Confirm to me how duplicates are prevented.
```

---

## WHEN to add this into the code

**Add it now / early — before real orders exist.** Reasons:

- Your backend is freshly built and the `orders`/`returns` tables are essentially empty (only test rows).
- Changing the code format is **easy now** and **painful later** (after thousands of real orders carry the old format).
- The delivery, returns, and reporting features all reference these codes — better they use the final format from the start.

**Suggested moment in your build sequence:**

1. First, next session, **verify the existing backend** (delivery + payment) works in Supabase — finish confirming what's built.
2. **Then apply this code logic** (paste the instruction above into Claude Code) and verify the codes in Supabase.
3. **Then** move on to the frontend (web app).

So: verify backend → apply this code format → build frontend. Slot it in right after verification, before the frontend phase.

---

## How to verify it worked (your eyes, in Supabase)

- Two PDK orders same day → codes end in `000001`, `000002`.
- A return on one order → proper `RETPDK...` code, linked to the right order.
- Ask Claude Code to explain how it guarantees no duplicates (should mention atomic counter / row lock / DB sequence).
