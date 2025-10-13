# Error Handling Guidelines

## Overview

This document establishes the standard error handling patterns for the Tago Analysis Runner backend. Consistent error handling improves maintainability, debugging, and user experience.

## Standard Pattern

### Controller Error Handling

All controller methods MUST use the `handleError` utility from `utils/responseHelpers.js`:

```javascript
import { handleError } from '../utils/responseHelpers.js';

class ExampleController {
  static async methodName(req, res) {
    try {
      // Your logic here
      const result = await someService.doSomething();
      res.json(result);
    } catch (error) {
      handleError(res, error, 'operation description');
    }
  }
}
```

### Operation Description

The operation description should be:

- **Verb phrase in gerund form** (e.g., 'creating team', 'updating analysis', 'deleting folder')
- **Lowercase** (the helper will format it appropriately)
- **Descriptive** of what failed (helps with debugging)

**Examples:**

```javascript
handleError(res, error, 'creating team');
handleError(res, error, 'fetching user details');
handleError(res, error, 'updating DNS configuration');
handleError(res, error, 'moving analysis to team');
```

## Error Response Format

The `handleError` function automatically:

1. Logs the error to the console
2. Determines the appropriate HTTP status code
3. Returns a standardized JSON error response

### Status Code Mapping

| Error Type                     | Status Code | Example                 |
| ------------------------------ | ----------- | ----------------------- |
| Path traversal / Invalid input | 400         | "Invalid file path"     |
| Not found                      | 404         | "Analysis not found"    |
| Already exists                 | 409         | "Team already exists"   |
| Cannot move                    | 400         | "Cannot move item"      |
| Default/Unknown                | 500         | "Failed to {operation}" |

### Error Response Shape

```json
{
  "error": "Error message here"
}
```

## Input Validation

Perform input validation BEFORE the try-catch block:

```javascript
static async createTeam(req, res) {
  // Validation outside try-catch
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  // Main logic in try-catch
  try {
    const team = await teamService.createTeam({ name });
    res.status(201).json(team);
  } catch (error) {
    handleError(res, error, 'creating team');
  }
}
```

## Custom Error Types

For service-level errors, throw descriptive Error objects:

```javascript
// In service layer
if (!team) {
  throw new Error('Team not found');
}

if (existingTeam) {
  throw new Error('Team already exists');
}

// The controller's handleError will catch and format appropriately
```

## Logging Options

The `handleError` function supports optional configuration:

```javascript
handleError(res, error, 'operation', {
  logError: false, // Suppress console logging if needed
});
```

## Anti-Patterns to Avoid

### ❌ Manual Error Handling

```javascript
catch (error) {
  console.error('Error doing thing:', error);
  res.status(500).json({ error: 'Failed to do thing' });
}
```

### ❌ Inconsistent Status Codes

```javascript
catch (error) {
  res.status(400).json({ error: error.message }); // Should be determined by error type
}
```

### ❌ Generic Error Messages

```javascript
catch (error) {
  handleError(res, error, 'processing'); // Too vague
}
```

## Best Practices

1. **Always use handleError** - Never write manual error responses in controllers
2. **Be specific** - Operation descriptions should clearly indicate what failed
3. **Validate early** - Check inputs before entering try-catch blocks
4. **Let services throw** - Service layer should throw descriptive errors
5. **Trust the helper** - The handleError function handles status codes and formatting

## Migration Checklist

When updating existing controllers:

- [ ] Import `handleError` from responseHelpers.js
- [ ] Replace all manual catch blocks with `handleError(res, error, 'operation')`
- [ ] Ensure operation descriptions are descriptive and in gerund form
- [ ] Move input validation outside try-catch blocks
- [ ] Remove any custom status code logic (let handleError decide)
- [ ] Test error scenarios to verify correct status codes

## Examples

### Before (Inconsistent)

```javascript
static async reorderTeams(req, res) {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }
    const teams = await teamService.reorderTeams(orderedIds);
    res.json(teams);
  } catch (error) {
    console.error('Error reordering teams:', error);
    res.status(500).json({ error: 'Failed to reorder teams' });
  }
}
```

### After (Consistent)

```javascript
static async reorderTeams(req, res) {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  try {
    const teams = await teamService.reorderTeams(orderedIds);
    res.json(teams);
  } catch (error) {
    handleError(res, error, 'reordering teams');
  }
}
```

## Questions or Issues

If you encounter an error type that doesn't fit the current patterns, update `responseHelpers.js` to handle it appropriately, then document it here.
