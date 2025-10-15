/**
 * Color picker component for team color selection
 * Displays predefined color swatches with selection and used state indicators
 * @module components/teams/TeamColorPicker
 */

import PropTypes from 'prop-types';
import {
  ColorSwatch,
  SimpleGrid,
  Box,
  Text,
  Group,
  CheckIcon,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';

export const PREDEFINED_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
];

/**
 * Individual color swatch with selection state
 */
export function ColorSwatchWithSelection({
  color,
  isUsed,
  isSelected,
  onClick,
  size = 32,
}) {
  return (
    <ColorSwatch
      component="button"
      color={color}
      size={size}
      onClick={
        !isUsed
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      style={{
        cursor: isUsed ? 'not-allowed' : 'pointer',
        opacity: isUsed ? 0.4 : 1,
        color: '#fff',
        border: isSelected
          ? '3px solid var(--mantine-color-blue-6)'
          : '2px solid transparent',
        boxSizing: 'border-box',
      }}
      disabled={isUsed}
    >
      {isUsed ? (
        <IconX size={size * 0.5} />
      ) : isSelected ? (
        <CheckIcon size={size * 0.4} />
      ) : null}
    </ColorSwatch>
  );
}

ColorSwatchWithSelection.propTypes = {
  color: PropTypes.string.isRequired,
  isUsed: PropTypes.bool,
  isSelected: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  size: PropTypes.number,
};

/**
 * Color picker grid component
 */
export function TeamColorPicker({
  selectedColor,
  usedColors,
  excludeColor = null,
  onColorSelect,
  size = 32,
  showLabel = true,
  showSelected = true,
}) {
  const availableColors = getAvailableColors(usedColors, excludeColor);

  return (
    <Box>
      {showLabel && (
        <Text size="xs" c="dimmed" mb="xs">
          Choose a color:
        </Text>
      )}
      <SimpleGrid cols={6} spacing="xs">
        {PREDEFINED_COLORS.map((color) => (
          <ColorSwatchWithSelection
            key={color}
            color={color}
            isUsed={usedColors.has(color) && color !== excludeColor}
            isSelected={selectedColor === color}
            onClick={() => onColorSelect(color)}
            size={size}
          />
        ))}
      </SimpleGrid>
      {availableColors.length === 0 && (
        <Text size="xs" c="orange" mt="xs">
          All predefined colors are in use.
        </Text>
      )}
      {showSelected && selectedColor && (
        <Group gap="xs" mt="xs">
          <Text size="xs" c="dimmed">
            Selected:
          </Text>
          <ColorSwatch color={selectedColor} size={20} />
          <Text size="xs" fw={500}>
            {selectedColor}
          </Text>
        </Group>
      )}
    </Box>
  );
}

TeamColorPicker.propTypes = {
  selectedColor: PropTypes.string,
  usedColors: PropTypes.instanceOf(Set).isRequired,
  excludeColor: PropTypes.string,
  onColorSelect: PropTypes.func.isRequired,
  size: PropTypes.number,
  showLabel: PropTypes.bool,
  showSelected: PropTypes.bool,
};

/**
 * Get available colors excluding those already used
 */
export function getAvailableColors(usedColors, excludeColor = null) {
  const exclude = new Set(usedColors);
  if (excludeColor) exclude.delete(excludeColor);
  return PREDEFINED_COLORS.filter((color) => !exclude.has(color));
}
