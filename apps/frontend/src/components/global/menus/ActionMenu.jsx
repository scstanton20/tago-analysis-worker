import { Menu, ActionIcon } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';
import PropTypes from 'prop-types';

/**
 * ActionMenu - Reusable action menu with icon trigger
 *
 * Wraps Mantine Menu + ActionIcon pattern used throughout the app.
 * Provides consistent styling and behavior for dropdown action menus.
 *
 */
export function ActionMenu({
  items = [],
  position = 'bottom-end',
  width = 200,
  zIndex = 1001,
  shadow = 'md',
  triggerIcon,
  triggerSize = 'lg',
  triggerColor = 'brand',
  triggerVariant = 'subtle',
  disabled = false,
  className,
  ...props
}) {
  if (!items || items.length === 0) return null;

  return (
    <Menu
      shadow={shadow}
      width={width}
      withinPortal
      zIndex={zIndex}
      position={position}
      className={className}
      {...props}
    >
      <Menu.Target>
        <ActionIcon
          variant={triggerVariant}
          size={triggerSize}
          color={triggerColor}
          disabled={disabled}
        >
          {triggerIcon || <IconDotsVertical size={16} />}
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {items.map((item, index) => {
          // Divider
          if (item.type === 'divider') {
            return <Menu.Divider key={`divider-${index}`} />;
          }

          // Label/Header
          if (item.type === 'label') {
            return <Menu.Label key={`label-${index}`}>{item.label}</Menu.Label>;
          }

          // Menu Item
          return (
            <Menu.Item
              key={item.key || `item-${index}`}
              onClick={item.onClick}
              color={item.color}
              leftSection={item.icon}
              disabled={item.disabled}
              closeMenuOnClick={item.closeMenuOnClick !== false}
            >
              {item.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

ActionMenu.propTypes = {
  /** Array of menu items */
  items: PropTypes.arrayOf(
    PropTypes.shape({
      /** Item type: 'item' (default), 'divider', or 'label' */
      type: PropTypes.oneOf(['item', 'divider', 'label']),
      /** Menu item label */
      label: PropTypes.string,
      /** Click handler */
      onClick: PropTypes.func,
      /** Icon to display */
      icon: PropTypes.node,
      /** Item color (e.g., 'red' for delete) */
      color: PropTypes.string,
      /** Disable the item */
      disabled: PropTypes.bool,
      /** Close menu on click (default: true) */
      closeMenuOnClick: PropTypes.bool,
      /** Unique key (optional, index used as fallback) */
      key: PropTypes.string,
    }),
  ).isRequired,
  /** Menu position */
  position: PropTypes.string,
  /** Menu width */
  width: PropTypes.number,
  /** Menu z-index */
  zIndex: PropTypes.number,
  /** Menu shadow */
  shadow: PropTypes.string,
  /** Custom trigger icon */
  triggerIcon: PropTypes.node,
  /** Trigger button size */
  triggerSize: PropTypes.string,
  /** Trigger button color */
  triggerColor: PropTypes.string,
  /** Trigger button variant */
  triggerVariant: PropTypes.string,
  /** Disable trigger button */
  disabled: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
};

export default ActionMenu;
