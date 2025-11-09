# Directory Password Migration Guide

## 📋 Overview

This guide explains how to migrate existing plaintext directory passwords to bcrypt-hashed passwords for enhanced security.

---

## 🔒 Security Improvements

### Before Migration

- ❌ Passwords stored in **plaintext**
- ❌ Vulnerable to database breaches
- ❌ No secure password hashing

### After Migration

- ✅ Passwords hashed with **bcrypt** (salt rounds: 10)
- ✅ Secure against database breaches
- ✅ Industry-standard password hashing
- ✅ Automatic hashing for new directories

---

## 🚀 Migration Steps

### 1️⃣ Check Current Password Status

```bash
# Connect to your PostgreSQL database
psql $DATABASE_URL

# Check directories with passwords
SELECT id, name,
       CASE
         WHEN password ~ '^\$2[aby]?\$\d{2}\$' THEN 'Hashed'
         ELSE 'Plaintext'
       END as password_status
FROM directories
WHERE password IS NOT NULL;
```

### 2️⃣ Run Migration Script

```bash
# From project root
node scripts/migrate-directory-passwords.mjs
```

**Expected Output:**

```
🔍 Checking for directories with plaintext passwords...

Found 3 directories with passwords:

🔒 Hashing password for "private-docs"...
✅ Migrated "private-docs"
🔒 Hashing password for "team-internal"...
✅ Migrated "team-internal"
⏭️  Skipped "secure-folder" (already hashed)

📊 Migration Summary:
   - Migrated: 2
   - Skipped (already hashed): 1
   - Total: 3

✨ Migration completed successfully!
```

### 3️⃣ Verify Migration

```bash
# Check that all passwords are now hashed
psql $DATABASE_URL -c "
SELECT id, name,
       password ~ '^\$2[aby]?\$\d{2}\$' as is_hashed,
       password_is_hashed
FROM directories
WHERE password IS NOT NULL;
"
```

All `is_hashed` values should be `true`.

### 4️⃣ Clean Up (Optional)

After confirming all passwords are migrated, remove the temporary tracking column:

```bash
# Run the cleanup migration
psql $DATABASE_URL < drizzle/0011_remove_password_is_hashed.sql
```

---

## 🔧 Code Changes Summary

### Storage Layer (`server/storage.ts`)

#### ✅ `createDirectory()`

- **Always hashes** new passwords with bcrypt
- No plaintext passwords created

#### ✅ `updateDirectory()`

- Detects if password is already hashed
- Only hashes if plaintext detected
- Prevents double-hashing

#### ✅ `verifyDirectoryPassword()`

- **Before:** Accepted both hashed and plaintext passwords (security risk)
- **After:** Only accepts bcrypt-hashed passwords
- Logs security warning for unhashed passwords
- Returns `false` for plaintext passwords

---

## 🧪 Testing

### Test Password Hashing

```bash
# Create a test directory with password
curl -X POST http://localhost:5002/api/directories \
  -H "Content-Type: application/json" \
  -d '{"name": "test-secure", "password": "mypassword123"}'

# Verify it was hashed in database
psql $DATABASE_URL -c "
SELECT name,
       substring(password, 1, 7) as hash_prefix,
       length(password) as hash_length
FROM directories
WHERE name = 'test-secure';
"
```

**Expected Output:**

```
     name      | hash_prefix | hash_length
---------------+-------------+-------------
 test-secure   | $2a$10$     | 60
```

### Test Password Verification

```bash
# Test correct password (should succeed)
curl -X POST http://localhost:5002/api/directories/test-secure/verify \
  -H "Content-Type: application/json" \
  -d '{"password": "mypassword123"}'

# Test wrong password (should fail)
curl -X POST http://localhost:5002/api/directories/test-secure/verify \
  -H "Content-Type: application/json" \
  -d '{"password": "wrongpassword"}'
```

---

## 📊 Migration Files

| File                                         | Purpose                                   |
| -------------------------------------------- | ----------------------------------------- |
| `drizzle/0006_hash_directory_passwords.sql`  | Adds `password_is_hashed` tracking column |
| `scripts/migrate-directory-passwords.mjs`    | Hashes all plaintext passwords            |
| `drizzle/0011_remove_password_is_hashed.sql` | Removes temporary tracking column         |
| `server/storage.ts`                          | Updated password handling logic           |

---

## 🔐 Security Best Practices

### ✅ Do's

- Run migration script during maintenance window
- Verify all passwords before removing fallback
- Log security warnings for unhashed passwords
- Use bcrypt with appropriate cost factor (10 rounds)

### ❌ Don'ts

- Don't skip the migration script
- Don't remove tracking column before verifying
- Don't store plaintext passwords in logs
- Don't reduce bcrypt cost factor below 10

---

## 🚨 Troubleshooting

### Issue: Migration script fails with connection error

**Solution:**

```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test database connection
psql $DATABASE_URL -c "SELECT version();"
```

### Issue: Some passwords still plaintext after migration

**Solution:**

```bash
# Re-run migration script (it's idempotent)
node scripts/migrate-directory-passwords.mjs

# Check for errors in output
```

### Issue: Users can't access password-protected directories

**Possible causes:**

1. Password was changed during migration
2. User is using old cached credentials
3. Database connection issue

**Solution:**

```bash
# Reset directory password (will be auto-hashed)
psql $DATABASE_URL -c "
UPDATE directories
SET password = 'newpassword123', password_is_hashed = false
WHERE name = 'problematic-directory';
"

# Re-run migration
node scripts/migrate-directory-passwords.mjs
```

---

## 📈 Performance Impact

- **Password hashing:** ~100-200ms per password (bcrypt cost: 10)
- **Verification:** ~100-200ms per verification (unchanged)
- **Database impact:** Minimal (password column remains TEXT)

**Note:** Bcrypt is intentionally slow to prevent brute-force attacks. This is a security feature, not a bug.

---

## 📚 References

- [bcrypt npm package](https://www.npmjs.com/package/bcryptjs)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [bcrypt cost factor guide](https://security.stackexchange.com/questions/17207/recommended-of-rounds-for-bcrypt)

---

## ✅ Completion Checklist

- [ ] Run migration script on development environment
- [ ] Verify all passwords are hashed
- [ ] Test directory password verification
- [ ] Run migration script on production environment
- [ ] Monitor logs for security warnings
- [ ] Remove `password_is_hashed` column (optional)
- [ ] Update team documentation

---

**Last Updated:** 2025-01-16  
**Status:** ✅ Ready for production deployment
