<template>
  <div
    v-if="activeComponentBusLabels || activeComponentProtocolLabels || activeComponentSystemLabels || activeComponentNetworkLabels || activeComponentComponentLabels"
    class="notice notice--warning component-bus-note"
  >
    <template v-if="activeComponentBusLabels">
      Make sure {{ activeComponentBusLabels }} is configured correctly.
      <a href="#" class="preview-callout-link" @click.prevent="emit('focus-bus')">
        BUSSES
      </a>
    </template>
    <template v-if="activeComponentProtocolLabels">
      <br v-if="activeComponentBusLabels" />
      Make sure {{ activeComponentProtocolLabels }} is configured correctly.
      <a href="#" class="preview-callout-link" @click.prevent="emit('focus-protocol')">
        PROTOCOLS
      </a>
    </template>
    <template v-if="activeComponentSystemLabels">
      <br v-if="activeComponentBusLabels || activeComponentProtocolLabels" />
      Make sure {{ activeComponentSystemLabels }} is configured correctly.
      <a href="#" class="preview-callout-link" @click.prevent="emit('focus-system')">
        SYSTEM
      </a>
    </template>
    <template v-if="activeComponentNetworkLabels">
      <br v-if="activeComponentBusLabels || activeComponentProtocolLabels || activeComponentSystemLabels" />
      Make sure {{ activeComponentNetworkLabels }} is configured correctly.
      <a href="#" class="preview-callout-link" @click.prevent="emit('focus-network')">
        NETWORK
      </a>
    </template>
    <template v-if="activeComponentComponentLabels">
      <br
        v-if="activeComponentBusLabels || activeComponentProtocolLabels || activeComponentSystemLabels || activeComponentNetworkLabels"
      />
      Make sure {{ activeComponentComponentLabels }} components are configured correctly.
    </template>
  </div>
</template>

<script setup>
defineProps({
  activeComponentBusLabels: { type: String, default: "" },
  activeComponentProtocolLabels: { type: String, default: "" },
  activeComponentSystemLabels: { type: String, default: "" },
  activeComponentNetworkLabels: { type: String, default: "" },
  activeComponentComponentLabels: { type: String, default: "" }
});

const emit = defineEmits(["focus-bus", "focus-protocol", "focus-system", "focus-network"]);
</script>
