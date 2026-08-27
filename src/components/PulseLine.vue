<script setup lang="ts">
// The app's signature visual motif: an ECG/vital-sign waveform. Used behind
// hero headlines, as a loading indicator, and as the celebration flourish on
// the results screen — always the same mark, so it reads as a consistent
// "this app is about vitals and precision" signature rather than a one-off
// decoration.

withDefaults(
  defineProps<{
    stroke?: string;
    animated?: boolean;
    height?: number;
  }>(),
  {
    stroke: '#2EE6B8',
    animated: true,
    height: 60,
  }
);
</script>

<template>
  <svg
    viewBox="0 0 600 100"
    :height="height"
    width="100%"
    preserveAspectRatio="none"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M0 50 H130 L155 50 L170 20 L190 82 L208 50 L225 50 L245 12 L262 88 L280 50 L340 50 L360 30 L378 70 L396 50 H600"
      :stroke="stroke"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
      :class="animated ? 'animate-pulseline' : ''"
      stroke-dasharray="240 240"
      pathLength="240"
    />
  </svg>
</template>
