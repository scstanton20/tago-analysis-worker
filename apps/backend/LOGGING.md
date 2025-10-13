# Logging Guidelines

## Overview

This document establishes the standard logging patterns for the Tago Analysis Runner backend using Pino structured logging. Consistent logging improves debugging, monitoring, and observability.

## Standard Pattern

### Controller Logging

All controllers MUST use the Pino logger from the request object:

```javascript
class ExampleController {
  static async methodName(req, res) {
    const logger =
      req.log?.child({ controller: 'ExampleController' }) || console;

    logger.info({ action: 'methodName', ...context }, 'Description of action');

    try {
      // Your logic here
      const result = await someService.doSomething();

      logger.info(
        { action: 'methodName', success: true },
        'Action completed successfully',
      );
      res.json(result);
    } catch (error) {
      handleError(res, error, 'operation description');
    }
  }
}
```

### Logger Initialization

**At the top of each controller method:**

```javascript
const logger = req.log?.child({ controller: 'ControllerName' }) || console;
```

This pattern:

- Creates a child logger with controller context
- Falls back to console if logger middleware is unavailable
- Ensures all logs are tagged with the controller name

## Log Levels

Use appropriate log levels based on the situation:

| Level            | When to Use                | Example                            |
| ---------------- | -------------------------- | ---------------------------------- |
| `logger.debug()` | Detailed debug information | Variable values, flow control      |
| `logger.info()`  | Normal operations          | Request received, action completed |
| `logger.warn()`  | Warning conditions         | Deprecated features, near-limits   |
| `logger.error()` | Error conditions           | Caught exceptions, failures        |

**Note:** Error logging is handled automatically by `handleError()` - don't log errors manually in catch blocks.

## Structured Logging Format

### Basic Pattern

```javascript
logger.info(
  { action: 'actionName', key: 'value' }, // Context object
  'Human-readable message', // Message string
);
```

### Required Context Fields

Include these fields in the context object:

- **action**: The name of the operation (e.g., 'createTeam', 'updateAnalysis')
- **Additional context**: Relevant IDs, names, or parameters

```javascript
logger.info({ action: 'createTeam', teamName: name }, 'Creating new team');

logger.info(
  { action: 'updateUser', userId: id, updates: Object.keys(updates) },
  'Updating user information',
);
```

## Common Patterns

### Controller Entry Point

```javascript
static async getUser(req, res) {
  const logger = req.log?.child({ controller: 'UserController' }) || console;
  const { id } = req.params;

  logger.info({ action: 'getUser', userId: id }, 'Fetching user details');

  try {
    const user = await userService.getUser(id);
    logger.info({ action: 'getUser', userId: id, found: !!user }, 'User fetch complete');
    res.json(user);
  } catch (error) {
    handleError(res, error, 'fetching user');
  }
}
```

### List Operations

```javascript
static async getAllTeams(req, res) {
  const logger = req.log?.child({ controller: 'TeamController' }) || console;

  logger.info({ action: 'getAllTeams' }, 'Retrieving all teams');

  try {
    const teams = await teamService.getAllTeams();
    logger.info({ action: 'getAllTeams', count: teams.length }, 'Teams retrieved');
    res.json(teams);
  } catch (error) {
    handleError(res, error, 'retrieving teams');
  }
}
```

### Create Operations

```javascript
static async createTeam(req, res) {
  const logger = req.log?.child({ controller: 'TeamController' }) || console;
  const { name, color, order } = req.body;

  if (!name) {
    logger.warn({ action: 'createTeam' }, 'Team creation failed: missing name');
    return res.status(400).json({ error: 'Team name is required' });
  }

  logger.info({ action: 'createTeam', teamName: name }, 'Creating team');

  try {
    const team = await teamService.createTeam({ name, color, order }, req.headers);
    logger.info({ action: 'createTeam', teamId: team.id, teamName: name }, 'Team created');
    res.status(201).json(team);
  } catch (error) {
    handleError(res, error, 'creating team');
  }
}
```

### Update Operations

```javascript
static async updateTeam(req, res) {
  const logger = req.log?.child({ controller: 'TeamController' }) || console;
  const { id } = req.params;
  const updates = req.body;

  logger.info(
    { action: 'updateTeam', teamId: id, fields: Object.keys(updates) },
    'Updating team'
  );

  try {
    const team = await teamService.updateTeam(id, updates);
    logger.info({ action: 'updateTeam', teamId: id }, 'Team updated');
    res.json(team);
  } catch (error) {
    handleError(res, error, 'updating team');
  }
}
```

### Delete Operations

```javascript
static async deleteTeam(req, res) {
  const logger = req.log?.child({ controller: 'TeamController' }) || console;
  const { id } = req.params;

  logger.info({ action: 'deleteTeam', teamId: id }, 'Deleting team');

  try {
    const result = await teamService.deleteTeam(id, req.headers);
    logger.info({ action: 'deleteTeam', teamId: id }, 'Team deleted');
    res.json(result);
  } catch (error) {
    handleError(res, error, 'deleting team');
  }
}
```

## Service Layer Logging

Services should use their own logger instance:

```javascript
class ExampleService {
  constructor() {
    this.logger = logger.child({ service: 'ExampleService' });
  }

  async doSomething() {
    this.logger.info({ action: 'doSomething' }, 'Performing operation');
    // ... logic
    this.logger.debug({ action: 'doSomething', detail: 'value' }, 'Debug info');
  }
}
```

## Anti-Patterns to Avoid

### ❌ Direct console.log/console.error

```javascript
// DON'T DO THIS
console.log('Creating team:', name);
console.error('Error creating team:', error);
```

### ❌ Logging Without Context

```javascript
// DON'T DO THIS
logger.info('Creating team'); // No context object
```

### ❌ Redundant Error Logging

```javascript
// DON'T DO THIS
catch (error) {
  logger.error({ error }, 'Failed to create team');  // handleError already logs
  handleError(res, error, 'creating team');
}
```

### ❌ Logging Sensitive Data

```javascript
// DON'T DO THIS
logger.info({ action: 'login', password: req.body.password }, 'User login');
logger.info({ action: 'updateSecret', apiKey: secret }, 'Updating API key');
```

## Best Practices

1. **Always use request logger** - Create child logger with controller context
2. **Log at entry points** - Log when controller methods are called
3. **Log on success** - Confirm operations completed successfully
4. **Include context** - Always provide structured data in context object
5. **Use appropriate levels** - Info for normal flow, debug for details, warn for issues
6. **Don't log errors in catch** - The handleError utility handles error logging
7. **Sanitize sensitive data** - Never log passwords, tokens, or API keys

## Log Output Examples

### Development

```
[1234567890] INFO (UserController): Retrieving all users
    action: "getAllUsers"
[1234567891] INFO (UserController): Users retrieved
    action: "getAllUsers"
    count: 42
```

### Production (JSON)

```json
{"level":30,"time":1234567890,"controller":"UserController","action":"getAllUsers","msg":"Retrieving all users"}
{"level":30,"time":1234567891,"controller":"UserController","action":"getAllUsers","count":42,"msg":"Users retrieved"}
```

## Observability Integration

Logs are automatically sent to:

- Console (development)
- Grafana Loki (if configured via LOG_LOKI_URL)

The structured logging format enables:

- Filtering by controller, action, or custom fields
- Aggregating metrics (e.g., requests per controller)
- Tracing request flows through the system

## Migration Checklist

When updating existing controllers:

- [ ] Add logger initialization at the top of each method
- [ ] Replace all `console.log()` with `logger.info()`
- [ ] Replace all `console.error()` with appropriate level or remove (if in catch block)
- [ ] Add structured context objects to all log statements
- [ ] Ensure action names match method names
- [ ] Remove redundant error logging from catch blocks
- [ ] Test that logs appear with correct structure and context

## Questions or Issues

If you need to log something that doesn't fit these patterns, consult the team or update this guide with the new pattern.
