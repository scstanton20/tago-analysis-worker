# Backend Test Refactoring Progress

**Date**: 2025-10-18
**Status**: 🟡 In Progress - 2/8 Route Tests Refactored

## Overview

This document tracks the progress of refactoring backend tests to use real authentication instead of mocks.

---

## ✅ Completed Infrastructure (100%)

### Test Utilities

- ✅ `tests/fixtures/testUsers.js` - 8 test users with different permission levels
- ✅ `tests/utils/authHelpers.js` - Real better-auth session management
- ✅ `tests/integration/authInfrastructure.test.js` - Infrastructure verification
- ✅ `TESTING_GUIDE.md` - Comprehensive testing documentation
- ✅ `TEST_AUDIT_REPORT.md` - Detailed problem analysis
- ✅ `TEST_INFRASTRUCTURE_SUMMARY.md` - Implementation guide

### Documentation

- ✅ Testing patterns documented
- ✅ Migration guide created
- ✅ Example refactored test provided
- ✅ Test user fixtures explained

---

## 🟢 Refactored Route Tests (2/8 = 25%)

### ✅ analysisRoutes.test.js

**Status**: Complete ✅
**Lines**: 494
**Features**:

- Real better-auth authentication
- Tests multiple user roles (admin, owner, editor, viewer, runner, no-access)
- Permission boundary tests (view, run, edit, delete)
- Cross-team isolation tests
- Multi-team user scenarios
- Admin bypass verification
- Negative tests (401, 403)
- Security edge cases

**Key Improvements**:

- Removed all auth mocks
- Added 8 different user role tests
- Tests would FAIL if security broken

### ✅ teamRoutes.test.js

**Status**: Complete ✅
**Lines**: 590
**Features**:

- Real better-auth authentication
- Admin-only access control tests
- Tests all non-admin users are properly denied
- Folder management security
- Team assignment security
- Negative tests (401, 403)

**Key Improvements**:

- Removed requireAdmin mocks
- Verified only admins can manage teams
- Tests multiple user roles attempting access
- Tests would FAIL if admin checks removed

---

## 🔴 Remaining Route Tests (6/8 = 75%)

### 🔴 userRoutes.test.js

**Status**: Not Started
**Priority**: HIGH
**Estimated Effort**: 2-3 hours
**Auth Pattern**: Admin-only user management
**Required Tests**:

- Admin can create/update/delete users
- Regular users cannot manage users
- User can update own profile
- Cross-user access denied

**Refactoring Template**:

```javascript
import { setupTestAuth, cleanupTestAuth, getSessionCookie } from '../utils/authHelpers.js';

beforeAll(async () => await setupTestAuth());
afterAll(async () => await cleanupTestAuth());

// Remove these mocks:
// vi.mock('../../src/middleware/betterAuthMiddleware.js')
// vi.mock('../../src/middleware/rateLimiter.js')

// Add real auth tests:
it('should allow admin to create users', async () => {
  const adminCookie = await getSessionCookie('admin');
  await request(app).post('/api/users').set('Cookie', adminCookie).send({...}).expect(201);
});

it('should deny regular users from creating users', async () => {
  const userCookie = await getSessionCookie('teamOwner');
  await request(app).post('/api/users').set('Cookie', userCookie).send({...}).expect(403);
});
```

---

### 🔴 settingsRoutes.test.js

**Status**: Not Started
**Priority**: HIGH
**Estimated Effort**: 2-3 hours
**Auth Pattern**: Admin-only settings management
**Required Tests**:

- Admin can view/update settings
- Regular users cannot access settings
- Settings isolation tests

**Refactoring Notes**:

- System settings should be admin-only
- Test configuration security
- Verify sensitive data protection

---

### 🔴 statusRoutes.test.js

**Status**: Not Started
**Priority**: MEDIUM
**Estimated Effort**: 1-2 hours
**Auth Pattern**: Authenticated users can view status
**Required Tests**:

- Authenticated users can view status
- Unauthenticated users denied
- Status data doesn't leak sensitive info

**Refactoring Notes**:

- Status endpoints likely read-only
- May allow all authenticated users
- Verify no sensitive data exposure

---

### 🔴 metricsRoutes.test.js

**Status**: Not Started
**Priority**: MEDIUM
**Estimated Effort**: 2-3 hours
**Auth Pattern**: Team-based metrics access
**Required Tests**:

- Users can view own team metrics
- Users cannot view other team metrics
- Admin can view all metrics
- Metrics data isolation

**Refactoring Notes**:

- Similar to analysis routes pattern
- Test cross-team isolation
- Verify metric data security

---

### 🔴 sseRoutes.test.js

**Status**: Not Started
**Priority**: MEDIUM
**Estimated Effort**: 2-3 hours
**Auth Pattern**: Team-based SSE subscriptions
**Required Tests**:

- Users can subscribe to own team events
- Users cannot subscribe to other team events
- Event data isolation
- Connection authentication

**Refactoring Notes**:

- SSE connections must be authenticated
- Test event filtering by team
- Verify no cross-team event leakage

---

### 🔴 authRoutes.test.js

**Status**: Not Started
**Priority**: LOW (Already tests auth)
**Estimated Effort**: 1 hour
**Auth Pattern**: Public endpoints + authenticated profile
**Required Tests**:

- Login/logout work correctly
- Session management
- Password change requires auth
- Profile endpoints authenticated

**Refactoring Notes**:

- Most auth routes are public (login, register)
- Focus on authenticated profile endpoints
- Session lifecycle testing

---

## 📊 Progress Metrics

| Category       | Complete  | Remaining | Progress |
| -------------- | --------- | --------- | -------- |
| Infrastructure | 6/6       | 0         | 100% ✅  |
| Documentation  | 4/4       | 0         | 100% ✅  |
| Route Tests    | 2/8       | 6         | 25% 🟡   |
| **Total**      | **12/18** | **6**     | **67%**  |

---

## 🎯 Next Steps

### Immediate (This Week)

1. ✅ Complete infrastructure setup
2. ✅ Refactor `analysisRoutes.test.js`
3. ✅ Refactor `teamRoutes.test.js`
4. 🔲 Refactor `userRoutes.test.js` (HIGH PRIORITY)
5. 🔲 Refactor `settingsRoutes.test.js` (HIGH PRIORITY)

### Short Term (Next Week)

6. 🔲 Refactor `metricsRoutes.test.js`
7. 🔲 Refactor `statusRoutes.test.js`
8. 🔲 Refactor `sseRoutes.test.js`
9. 🔲 Refactor `authRoutes.test.js`

### Testing & Validation

10. 🔲 Run full test suite
11. 🔲 Verify tests fail when security broken
12. 🔲 Measure test coverage
13. 🔲 Performance benchmark

---

## 📋 Refactoring Checklist

For each route test file, ensure:

### Remove Mocks

- [ ] Remove `vi.mock('../../src/middleware/betterAuthMiddleware.js')`
- [ ] Remove `vi.mock('../../src/middleware/rateLimiter.js')`
- [ ] Keep only external service mocks (file system, SSE, etc.)

### Add Auth Infrastructure

- [ ] Import `setupTestAuth`, `cleanupTestAuth`, `getSessionCookie`
- [ ] Add `beforeAll(async () => await setupTestAuth())`
- [ ] Add `afterAll(async () => await cleanupTestAuth())`
- [ ] Use real middleware in `beforeEach`

### Add Authentication Tests

- [ ] Test unauthenticated requests (expect 401)
- [ ] Test invalid session tokens (expect 401)
- [ ] Test authenticated requests succeed (expect 200/201)

### Add Authorization Tests

- [ ] Test admin access (if admin-only)
- [ ] Test regular user denial (if admin-only)
- [ ] Test permission boundaries (view/edit/delete)
- [ ] Test cross-team isolation

### Add User Role Tests

- [ ] Test `admin` user
- [ ] Test `teamOwner` user
- [ ] Test `teamEditor` user
- [ ] Test `teamViewer` user
- [ ] Test `teamRunner` user
- [ ] Test `noAccess` user
- [ ] Test `multiTeamUser` scenarios
- [ ] Test `team2User` isolation

### Add Negative Tests

- [ ] Test unauthorized access (403)
- [ ] Test cross-team access attempts (403)
- [ ] Test permission escalation attempts (403)
- [ ] Test invalid data/requests (400)

### Verify Security

- [ ] Tests fail if auth middleware removed
- [ ] Tests fail if permission checks removed
- [ ] Tests fail if team isolation broken
- [ ] Tests catch real security vulnerabilities

---

## 🚀 Quick Start Template

Copy this template when refactoring a new route test:

```javascript
/**
 * [Route Name] Routes Integration Tests
 *
 * - Uses REAL better-auth authentication (no mocks)
 * - Tests multiple user roles and permissions
 * - Includes negative test cases (401, 403)
 * - Tests permission boundaries
 * - Uses real database sessions
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  setupTestAuth,
  cleanupTestAuth,
  getSessionCookie,
} from '../utils/authHelpers.js';

// Mock only external dependencies - NO AUTH MOCKS!
vi.mock('../../src/utils/storage.js', () => ({
  // Mock file system operations
}));

describe('[Route Name] Routes - WITH REAL AUTH', () => {
  let app;

  beforeAll(async () => {
    await setupTestAuth();
  });

  afterAll(async () => {
    await cleanupTestAuth();
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create fresh Express app with REAL middleware
    app = express();
    app.use(express.json());

    const { attachRequestLogger } = await import(
      '../../src/middleware/loggingMiddleware.js'
    );
    app.use(attachRequestLogger);

    const { default: routes } = await import('../../src/routes/[routeName].js');
    app.use('/api/[path]', routes);
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app).get('/api/[path]').expect(401);
    });

    it('should allow authenticated requests', async () => {
      const cookie = await getSessionCookie('admin');
      await request(app).get('/api/[path]').set('Cookie', cookie).expect(200);
    });
  });

  describe('Permission Boundaries', () => {
    it('should allow admin access', async () => {
      const adminCookie = await getSessionCookie('admin');
      await request(app)
        .get('/api/[path]')
        .set('Cookie', adminCookie)
        .expect(200);
    });

    it('should deny regular user access', async () => {
      const userCookie = await getSessionCookie('teamViewer');
      await request(app)
        .get('/api/[path]')
        .set('Cookie', userCookie)
        .expect(403);
    });
  });
});
```

---

## 💡 Tips for Refactoring

### 1. Start Simple

- Read the existing test
- Identify auth mocks
- Remove auth mocks
- Add real auth setup
- Run tests to see what breaks
- Fix tests one by one

### 2. Use Test Users Strategically

- `admin` - For admin-only operations
- `teamOwner` - For team management with permissions
- `teamEditor` - For edit but not delete
- `teamViewer` - For read-only access
- `noAccess` - For denied access tests

### 3. Test Patterns

- **Admin-only**: Test admin succeeds, all others denied
- **Team-based**: Test team members succeed, others denied
- **Permission-based**: Test each permission level
- **Cross-team**: Test isolation between teams

### 4. Common Pitfalls

- ❌ Forgetting to await `getSessionCookie()`
- ❌ Not importing real middleware
- ❌ Leaving auth mocks in place
- ❌ Not testing negative cases
- ❌ Not cleaning up test data

---

## 📈 Success Metrics

### Before Refactoring

- ❌ Tests pass when auth is broken
- ❌ Only one user role tested (admin)
- ❌ No permission boundary tests
- ❌ No cross-team isolation tests
- ❌ False sense of security

### After Refactoring

- ✅ Tests fail when auth is broken
- ✅ Multiple user roles tested
- ✅ Permission boundaries verified
- ✅ Cross-team isolation tested
- ✅ Real security confidence

---

## 🔗 Resources

- **Testing Guide**: `tests/TESTING_GUIDE.md`
- **Audit Report**: `TEST_AUDIT_REPORT.md`
- **Test Fixtures**: `tests/fixtures/testUsers.js`
- **Auth Helpers**: `tests/utils/authHelpers.js`
- **Example Test**: `tests/routes/analysisRoutes.test.js`
- **Template Test**: `tests/routes/analysisRoutes.REFACTORED.test.js`

---

## 🎉 Completed Milestones

- [x] **Infrastructure Setup** - Test users, auth helpers, documentation (2025-10-18)
- [x] **First Route Refactored** - analysisRoutes.test.js with full permission testing (2025-10-18)
- [x] **Second Route Refactored** - teamRoutes.test.js with admin-only verification (2025-10-18)
- [ ] **Half Complete** - 4/8 route tests refactored
- [ ] **All Routes Complete** - 8/8 route tests using real auth
- [ ] **Full Test Suite Passing** - All tests green
- [ ] **Security Verified** - Tests fail when security broken

---

**Last Updated**: 2025-10-18
**Next Review**: After completing userRoutes and settingsRoutes refactoring
