# Semantic Button Components

**Standardized button system for consistent UI/UX across the application**

---

## Overview

This directory contains semantic button components that provide a consistent, maintainable button system. Instead of manually specifying variants and colors on every button, use these semantic components that clearly communicate intent.

## 🎯 Quick Start

```jsx
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  SuccessButton,
  UtilityButton,
  CancelButton,
  FormActionButtons
} from '../global';

// Primary action
<PrimaryButton onClick={handleSubmit}>Submit</PrimaryButton>

// Destructive action
<DangerButton onClick={handleDelete}>Delete</DangerButton>

// Form with submit/cancel
<FormActionButtons
  onSubmit={handleSave}
  onCancel={handleCancel}
  submitLabel="Save Changes"
/>
```

---

## 📦 Available Components

### PrimaryButton

**Use for:** Main call-to-action buttons, primary actions

**Visual:** Gradient (brand → accent)

**Examples:** Login, Submit Form, Save, Get Started

```jsx
<PrimaryButton
  onClick={handleSignIn}
  loading={isLoading}
  size="md"
  leftSection={<IconLogin size={18} />}
>
  Sign In
</PrimaryButton>
```

**Props:** Extends all Mantine `Button` props

---

### SecondaryButton

**Use for:** Alternative actions, toggles, navigation

**Visual:** Light variant with brand color

**Examples:** Edit, Show Details, Settings, View All

```jsx
<SecondaryButton
  onClick={handleEdit}
  size="sm"
  leftSection={<IconEdit size={16} />}
>
  Edit
</SecondaryButton>
```

**Props:** Extends all Mantine `Button` props

---

### DangerButton

**Use for:** Destructive actions (delete, remove, stop, revoke)

**Visual:** Light variant with red color

**Examples:** Delete, Remove, Stop, Revoke

```jsx
<DangerButton
  onClick={handleDelete}
  size="xs"
  leftSection={<IconTrash size={14} />}
>
  Delete
</DangerButton>
```

**Props:** Extends all Mantine `Button` props

**Important:** Always confirm destructive actions with a modal/dialog!

---

### SuccessButton

**Use for:** Positive confirmations, completions

**Visual:** Filled variant with green color

**Examples:** Done, Complete, Approve, Confirm

```jsx
<SuccessButton onClick={handleComplete} size="sm">
  Done
</SuccessButton>
```

**Props:** Extends all Mantine `Button` props

---

### UtilityButton

**Use for:** Low-emphasis actions (pagination, toggles)

**Visual:** Subtle variant

**Examples:** Load More, Show/Hide, Expand, Collapse

```jsx
<UtilityButton onClick={handleLoadMore} size="xs">
  Load More Logs
</UtilityButton>
```

**Props:** Extends all Mantine `Button` props

---

### CancelButton

**Use for:** Cancellation, dismissal actions

**Visual:** Default variant (gray)

**Examples:** Cancel, Close, Dismiss, Go Back

```jsx
<CancelButton onClick={handleCancel}>Cancel</CancelButton>
```

**Props:** Extends all Mantine `Button` props

---

### FormActionButtons

**Use for:** Form submit/cancel button pairs

**Visual:** Uses preset system (primary/success/danger)

**Examples:** Any form with both submit and cancel actions

```jsx
<FormActionButtons
  onSubmit={handleSave}
  onCancel={handleCancel}
  loading={isSaving}
  disabled={!hasChanges}
  submitLabel="Save Changes"
  cancelLabel="Cancel"
  submitPreset="primary" // or 'success' or 'danger'
/>
```

**Props:**

- `onSubmit` (function) - Submit handler
- `onCancel` (function) - Cancel handler
- `submitLabel` (string) - Submit button text (default: "Submit")
- `cancelLabel` (string) - Cancel button text (default: "Cancel")
- `submitPreset` (string) - 'primary' | 'success' | 'danger' (default: "primary")
- `loading` (boolean) - Loading state
- `disabled` (boolean) - Disabled state
- `submitIcon` (ReactNode) - Icon for submit button
- `cancelIcon` (ReactNode) - Icon for cancel button
- `...groupProps` - Any Mantine Group props (mt, mb, justify, etc.)

---

## 🎨 Button Sizing Guide

Match button size to context:

| Size | Use Case                                  | Icon Size |
| ---- | ----------------------------------------- | --------- |
| `xs` | Inline actions, table rows, compact UIs   | `14`      |
| `sm` | **Default** - Forms, modals, most buttons | `16`      |
| `md` | Auth pages, important CTAs, landing pages | `18`      |
| `lg` | Hero sections, error pages, major CTAs    | `20`      |

```jsx
// Table row
<DangerButton size="xs">Delete</DangerButton>

// Modal (default)
<PrimaryButton size="sm">Save</PrimaryButton>

// Auth page
<PrimaryButton size="md" fullWidth>Sign In</PrimaryButton>

// Error page
<PrimaryButton size="lg">Reload Application</PrimaryButton>
```

---

## 🚦 Decision Tree

**Choose the right button component:**

```
Is this a form with submit AND cancel?
├─ YES → Use FormActionButtons
└─ NO ↓

Is this the primary action on the page?
├─ YES → Use PrimaryButton
└─ NO ↓

Is this destructive (delete/remove/stop)?
├─ YES → Use DangerButton
└─ NO ↓

Is this a positive confirmation (done/approve)?
├─ YES → Use SuccessButton
└─ NO ↓

Is this cancel/dismiss?
├─ YES → Use CancelButton
└─ NO ↓

Is this low-emphasis (load more/toggle)?
├─ YES → Use UtilityButton
└─ NO → Use SecondaryButton
```

---

## ✅ Best Practices

### DO ✓

```jsx
// Clear semantic meaning
<PrimaryButton>Submit</PrimaryButton>
<DangerButton>Delete</DangerButton>

// Only ONE primary button per view
<PrimaryButton>Submit</PrimaryButton>
<SecondaryButton>Save Draft</SecondaryButton>

// Match icon size to button size
<PrimaryButton size="md" leftSection={<IconLogin size={18} />}>
  Sign In
</PrimaryButton>

// Use FormActionButtons for forms
<FormActionButtons
  onSubmit={handleSave}
  onCancel={handleCancel}
/>
```

### DON'T ✗

```jsx
// ❌ Don't use raw Button from @mantine/core
import { Button } from '@mantine/core';
<Button variant="gradient">Submit</Button>

// ❌ Don't use multiple primary buttons
<PrimaryButton>Save</PrimaryButton>
<PrimaryButton>Submit</PrimaryButton>

// ❌ Don't use wrong semantic button
<SuccessButton onClick={handleDelete}>Delete</SuccessButton>

// ❌ Don't mismatch icon sizes
<PrimaryButton size="xs" leftSection={<IconLogin size={20} />}>
  Sign In
</PrimaryButton>
```

---

## 🔧 Common Patterns

### Pattern 1: Modal Footer

```jsx
<Group justify="flex-end" mt="md">
  <SecondaryButton onClick={() => modals.close(id)}>Close</SecondaryButton>
  <PrimaryButton onClick={handleSave} loading={isLoading}>
    Save Changes
  </PrimaryButton>
</Group>
```

### Pattern 2: Destructive Confirmation

```jsx
<FormActionButtons
  submitPreset="danger"
  submitLabel="Yes, Delete"
  cancelLabel="No, Keep It"
  onSubmit={handleDelete}
  onCancel={handleCancel}
/>
```

### Pattern 3: Multi-Step Form

```jsx
// Step 1-2
<Group justify="space-between">
  <SecondaryButton onClick={handleBack}>Back</SecondaryButton>
  <PrimaryButton onClick={handleNext}>Next</PrimaryButton>
</Group>

// Final step
<Group justify="space-between">
  <SecondaryButton onClick={handleBack}>Back</SecondaryButton>
  <SuccessButton onClick={handleComplete}>Complete</SuccessButton>
</Group>
```

### Pattern 4: List Item Actions

```jsx
<Group gap="xs">
  <SecondaryButton size="xs" onClick={handleView}>
    View
  </SecondaryButton>
  <SecondaryButton size="xs" onClick={handleEdit}>
    Edit
  </SecondaryButton>
  <DangerButton size="xs" onClick={handleDelete}>
    Delete
  </DangerButton>
</Group>
```

### Pattern 5: Loading States

```jsx
<PrimaryButton loading={isSubmitting} onClick={handleSubmit}>
  {isSubmitting ? 'Saving...' : 'Save Changes'}
</PrimaryButton>
```

---

## 🚨 ESLint Enforcement

The codebase enforces semantic button usage via ESLint:

```javascript
// ✅ ALLOWED - Semantic components
import { PrimaryButton, DangerButton } from '../global';

// ❌ BLOCKED - Raw Mantine Button
import { Button } from '@mantine/core'; // ESLint error!
```

**Exception:** Global components themselves can import raw `Button` to wrap it.

---
