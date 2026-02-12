<template>
  <aside class="display-inspector" :class="{ 'display-inspector--flat': variant === 'flat' }">
    <div v-if="showHeader" class="display-inspector__header">
      <h4>Inspector</h4>
      <span v-if="selectedElement" class="display-inspector__type">{{ selectedElement.type }}</span>
    </div>

    <div v-if="!selectedElement" class="note">Select an element on the canvas.</div>

    <div v-else class="display-inspector__form">
      <template v-if="selectedElement.type === 'shape'">
        <div>
          <label for="shapeType">Shape</label>
          <select id="shapeType" :value="selectedElement.shapeType" @change="updateText('shapeType', $event)">
            <option value="line">Line</option>
            <option value="rect">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="triangle">Triangle</option>
            <option value="polygon5">Pentagon</option>
            <option value="polygon6">Hexagon</option>
            <option value="polygon7">Heptagon</option>
            <option value="polygon8">Octagon</option>
          </select>
        </div>

        <div>
          <label for="rotation">Rotation</label>
          <select id="rotation" :value="selectedElement.rotation" @change="updateNumber('rotation', $event)">
            <option v-for="option in rotationOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>

        <div v-if="selectedElement.shapeType !== 'line'">
          <label for="filled">Filled</label>
          <input
            id="filled"
            type="checkbox"
            class="schema-checkbox"
            :checked="selectedElement.filled"
            @change="updateBool('filled', $event)"
          />
        </div>

        <div class="display-inspector__row display-inspector__row--quad">
          <div class="display-inspector__field">
            <label for="posX">X</label>
            <input id="posX" type="number" :value="selectedElement.x" @input="updateNumber('x', $event)" />
          </div>
          <div class="display-inspector__field">
            <label for="posY">Y</label>
            <input id="posY" type="number" :value="selectedElement.y" @input="updateNumber('y', $event)" />
          </div>
          <span class="display-inspector__group-divider"></span>
          <div class="display-inspector__field">
            <label for="sizeW">W</label>
            <input id="sizeW" type="number" :value="selectedElement.w" @input="updateNumber('w', $event)" />
          </div>
          <div class="display-inspector__field">
            <label for="sizeH">H</label>
            <input id="sizeH" type="number" :value="selectedElement.h" @input="updateNumber('h', $event)" />
          </div>
        </div>

        <div v-if="showColorPicker" class="display-icon-picker">
          <label for="shapeColor">Color</label>
          <div class="schema-icon-row">
            <input
              id="shapeColor"
              type="text"
              :value="colorInputValue"
              placeholder="#RRGGBB"
              @input="updateText('color', $event)"
            />
            <button type="button" class="secondary compact schema-icon-btn" @click="openColorPicker">
              <span class="schema-color-icon" :style="{ backgroundColor: colorSwatch }"></span>
            </button>
          </div>
          <ColorPickerModal
            :open="colorPickerOpen"
            :selected="colorInputValue"
            @close="handleColorClose"
            @select="handleColorSelect"
          />
        </div>

        <div v-if="shapeHint" class="note">{{ shapeHint }}</div>
      </template>

      <template v-else>
        <div class="display-inspector__row display-inspector__row--quad">
          <div class="display-inspector__field">
            <label for="posX">X</label>
            <input id="posX" type="number" :value="selectedElement.x" @input="updateNumber('x', $event)" />
          </div>
          <div class="display-inspector__field">
            <label for="posY">Y</label>
            <input id="posY" type="number" :value="selectedElement.y" @input="updateNumber('y', $event)" />
          </div>
          <span class="display-inspector__group-divider"></span>
          <div class="display-inspector__field">
            <label for="sizeW">W</label>
            <input id="sizeW" type="number" :value="selectedElement.w" @input="updateNumber('w', $event)" />
          </div>
          <div class="display-inspector__field">
            <label for="sizeH">H</label>
            <input id="sizeH" type="number" :value="selectedElement.h" @input="updateNumber('h', $event)" />
          </div>
        </div>

        <div v-if="selectedElement.type === 'graph' && !selectedElement.useTraces">
          <label for="graphSensor">Sensor ID *</label>
          <select
            id="graphSensor"
            :value="selectedElement.sensor"
            :class="{ 'field-error': graphSensorRequiredError }"
            @change="updateText('sensor', $event)"
          >
            <option value="">Select sensor</option>
            <option v-for="entry in graphSensorOptions" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </option>
          </select>
          <div v-if="graphSensorRequiredError" class="field-error-text">
            {{ graphSensorErrorText }}
          </div>
        </div>

        <div v-if="showRotation">
          <label for="rotation">Rotation</label>
          <select id="rotation" :value="selectedElement.rotation" @change="updateNumber('rotation', $event)">
            <option v-for="option in rotationOptions" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>

        <div v-if="selectedElement.type === 'text'">
          <label for="textMode">Mode</label>
          <select
            id="textMode"
            :value="selectedElement.textMode || 'static'"
            @change="updateText('textMode', $event)"
          >
            <option v-for="option in dynamicModeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div v-if="selectedElement.type === 'text' && (selectedElement.textMode || 'static') === 'static'">
          <label for="textValue">Text</label>
          <input
            id="textValue"
            type="text"
            :value="selectedElement.text"
            @input="updateText('text', $event)"
          />
        </div>

        <div v-if="selectedElement.type === 'text' && (selectedElement.textMode || 'static') === 'dynamic'">
          <label for="dynamicId">Source ID</label>
          <select
            id="dynamicId"
            :value="selectedElement.dynamicId"
            :class="{ 'field-error': dynamicIdRequiredError }"
            @change="updateText('dynamicId', $event)"
          >
            <option value="">Select ID</option>
            <option v-for="entry in dynamicIdOptions" :key="entry.id" :value="entry.id">
              {{ entry.label }}
            </option>
          </select>
          <div v-if="dynamicIdRequiredError" class="field-error-text">
            {{ dynamicIdErrorText }}
          </div>
        </div>

        <div
          v-if="selectedElement.type === 'text' && (selectedElement.textMode || 'static') === 'dynamic'"
          class="display-inspector__row"
        >
          <div>
            <label for="prefix">Prefix</label>
            <input id="prefix" type="text" :value="selectedElement.prefix" @input="updateText('prefix', $event)" />
          </div>
          <div>
            <label for="suffix">Suffix</label>
            <input id="suffix" type="text" :value="selectedElement.suffix" @input="updateText('suffix', $event)" />
          </div>
        </div>

        <div
          v-if="selectedElement.type === 'text' && (selectedElement.textMode || 'static') === 'dynamic'"
          class="display-inspector__row"
        >
          <div v-if="isNumericDomain(selectedElement.dynamicDomain)">
            <label for="format">Format</label>
            <input id="format" type="text" :value="selectedElement.format" @input="updateText('format', $event)" />
          </div>
        </div>

        <div
          v-if="
            selectedElement.type === 'text' &&
            (selectedElement.textMode || 'static') === 'dynamic' &&
            isBinaryDomain(selectedElement.dynamicDomain)
          "
          class="display-inspector__row"
        >
          <div>
            <label for="onLabel">On label</label>
            <input id="onLabel" type="text" :value="selectedElement.onLabel" @input="updateText('onLabel', $event)" />
          </div>
          <div>
            <label for="offLabel">Off label</label>
            <input id="offLabel" type="text" :value="selectedElement.offLabel" @input="updateText('offLabel', $event)" />
          </div>
        </div>

        <div v-if="selectedElement.type === 'text'">
          <label for="wrap">Wrap text</label>
          <select
            id="wrap"
            :value="(selectedElement.wrap !== false).toString()"
            @change="updateBoolSelect('wrap', $event)"
          >
            <option value="true">TRUE</option>
            <option value="false">FALSE</option>
          </select>
        </div>

        <div v-if="showColorPicker" class="display-icon-picker">
          <label for="elementColor">Color</label>
          <div class="schema-icon-row">
            <input
              id="elementColor"
              type="text"
              :value="colorInputValue"
              placeholder="#RRGGBB"
              @input="updateText('color', $event)"
            />
            <button type="button" class="secondary compact schema-icon-btn" @click="openColorPicker">
              <span class="schema-color-icon" :style="{ backgroundColor: colorSwatch }"></span>
            </button>
          </div>
          <ColorPickerModal
            :open="colorPickerOpen"
            :selected="colorInputValue"
            @close="handleColorClose"
            @select="handleColorSelect"
          />
        </div>

        <div v-if="selectedElement.type === 'text'">
          <label for="fontSource">Font source</label>
          <select
            id="fontSource"
            :value="selectedElement.fontSource || 'local'"
            @change="handleFontSourceChange"
          >
            <option value="local">Local</option>
            <option value="google">Google Fonts</option>
          </select>
        </div>

        <div v-if="selectedElement.type === 'text' && (selectedElement.fontSource || 'local') === 'local'">
          <label for="fontLocal">Font</label>
          <select id="fontLocal" :value="selectedElement.fontFile" @change="handleLocalFontChange">
            <option v-for="font in localFonts" :key="font.file" :value="font.file">
              {{ font.label }}
            </option>
          </select>
        </div>

        <div
          v-if="selectedElement.type === 'text' && selectedElement.fontSource === 'google'"
          class="display-inspector__row"
        >
          <div>
            <label for="fontFamily">Font family</label>
            <select id="fontFamily" :value="selectedElement.fontFamily" @change="handleGoogleFamilyChange">
              <option v-for="font in googleFonts" :key="font.family" :value="font.family">
                {{ font.family }}
              </option>
            </select>
          </div>
          <div>
            <label for="fontVariant">Variant</label>
            <select id="fontVariant" :value="selectedElement.fontVariant" @change="handleGoogleVariantChange">
              <option
                v-for="variant in googleFonts.find((item) => item.family === selectedElement.fontFamily)?.variants || []"
                :key="variant"
                :value="variant"
              >
                {{ variant }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="selectedElement.type === 'image'">
          <label for="imageValue">Image</label>
          <select
            id="imageValue"
            :value="selectedElement.image"
            :class="{ 'field-error': imageFileRequiredError }"
            @change="handleImageChange"
          >
            <option value="">Select image</option>
            <option v-for="image in images" :key="image.file" :value="image.file">
              {{ image.label }}
            </option>
          </select>
          <div v-if="imageFileRequiredError" class="field-error-text">
            {{ imageFileErrorText }}
          </div>
        </div>

        <div v-if="selectedElement.type === 'image'">
          <label for="imageType">Image type</label>
          <select
            id="imageType"
            :value="selectedElement.imageType || 'BINARY'"
            @change="updateText('imageType', $event)"
          >
            <option value="BINARY">BINARY</option>
            <option value="TRANSPARENT_BINARY">TRANSPARENT_BINARY</option>
          </select>
        </div>

        <div v-if="selectedElement.type === 'image'">
          <label for="imageInvert">Invert</label>
          <select
            id="imageInvert"
            :value="Boolean(selectedElement.invert).toString()"
            @change="updateBoolSelect('invert', $event)"
          >
            <option value="true">TRUE</option>
            <option value="false">FALSE</option>
          </select>
        </div>

        <template v-if="selectedElement.type === 'animation'">
          <div>
            <label for="animationId">Animation ID *</label>
            <input
              id="animationId"
              type="text"
              :value="selectedElement.animationId"
              placeholder="animation_id"
              :class="{ 'field-error': animationIdRequiredError }"
              @input="updateText('animationId', $event)"
            />
            <div v-if="animationIdRequiredError" class="field-error-text">
              Please provide an animation ID.
            </div>
          </div>

          <div>
            <label for="animationFile">Animation file *</label>
            <select
              id="animationFile"
              :value="selectedElement.animationFile"
              :class="{ 'field-error': animationFileRequiredError }"
              @change="handleAnimationFileChange"
            >
              <option value="">Select animation</option>
              <option v-for="file in animationFiles" :key="file" :value="file">
                {{ file }}
              </option>
            </select>
            <div v-if="animationFileRequiredError" class="field-error-text">
              {{ animationFileErrorText }}
            </div>
          </div>

          <div>
            <label for="animationTransparency">Transparency</label>
            <select
              id="animationTransparency"
              :value="selectedElement.animationTransparency || 'opaque'"
              @change="updateText('animationTransparency', $event)"
            >
              <option value="opaque">opaque</option>
              <option value="chroma_key">chroma_key</option>
              <option v-if="!isMonochrome" value="alpha_channel">alpha_channel</option>
            </select>
          </div>


          <div class="display-inspector__row">
            <div>
              <label for="animationLoop">Loop</label>
              <select
                id="animationLoop"
                :value="Boolean(selectedElement.loopEnabled).toString()"
                @change="updateBoolSelect('loopEnabled', $event)"
              >
                <option value="true">TRUE</option>
                <option value="false">FALSE</option>
              </select>
            </div>
            <div>
              <label for="animationAuto">Auto animate</label>
              <select
                id="animationAuto"
                :value="Boolean(selectedElement.autoAnimate).toString()"
                @change="updateBoolSelect('autoAnimate', $event)"
              >
                <option value="true">TRUE</option>
                <option value="false">FALSE</option>
              </select>
            </div>
          </div>

          <div v-if="selectedElement.autoAnimate">
            <label for="animationInterval">Interval (ms)</label>
            <input
              id="animationInterval"
              type="number"
              :value="selectedElement.intervalMs"
              placeholder="200"
              @input="updateNumber('intervalMs', $event)"
            />
          </div>

          <div v-if="selectedElement.loopEnabled" class="display-inspector__row">
            <div>
              <label for="animationLoopStart">Start frame</label>
              <input
                id="animationLoopStart"
                type="number"
                :value="selectedElement.loopStart"
                placeholder="0"
                @input="updateNumber('loopStart', $event)"
              />
            </div>
            <div>
              <label for="animationLoopEnd">End frame</label>
              <input
                id="animationLoopEnd"
                type="number"
                :value="selectedElement.loopEnd"
                placeholder="10"
                @input="updateNumber('loopEnd', $event)"
              />
            </div>
          </div>

          <div v-if="selectedElement.loopEnabled">
            <label for="animationLoopRepeat">Repeat</label>
            <input
              id="animationLoopRepeat"
              type="number"
              :value="selectedElement.loopRepeat"
              placeholder="0"
              @input="updateNumber('loopRepeat', $event)"
            />
          </div>
        </template>

        <template v-if="selectedElement.type === 'graph'">
          <div>
            <label for="graphId">Graph ID *</label>
            <input
              id="graphId"
              type="text"
              :value="selectedElement.graphId"
              placeholder="graph_id"
              :class="{ 'field-error': graphIdRequiredError }"
              @input="updateText('graphId', $event)"
            />
            <div v-if="graphIdRequiredError" class="field-error-text">
              Please provide a graph ID.
            </div>
          </div>

          <div class="display-inspector__row">
            <div>
              <label for="graphDuration">Duration *</label>
              <input
                id="graphDuration"
                type="text"
                :value="selectedElement.duration"
                placeholder="24h"
                :class="{ 'field-error': graphDurationRequiredError }"
                @input="updateText('duration', $event)"
              />
            </div>
            <div>
              <label for="graphBorder">Border</label>
              <input
                id="graphBorder"
                type="checkbox"
                class="schema-checkbox"
                :checked="selectedElement.border !== false"
                @change="updateBool('border', $event)"
              />
            </div>
          </div>

          <div class="display-inspector__row">
            <div>
              <label for="graphXGrid">X grid</label>
              <input
                id="graphXGrid"
                type="text"
                :value="selectedElement.xGrid"
                placeholder="10min"
                @input="updateText('xGrid', $event)"
              />
            </div>
            <div>
              <label for="graphYGrid">Y grid</label>
              <input
                id="graphYGrid"
                type="text"
                :value="selectedElement.yGrid"
                placeholder="1.0"
                @input="updateText('yGrid', $event)"
              />
            </div>
          </div>

          <div class="display-inspector__row">
            <div>
              <label for="graphMinRange">Min range</label>
              <input
                id="graphMinRange"
                type="number"
                :value="selectedElement.minRange"
                placeholder="0"
                @input="updateNumber('minRange', $event)"
              />
            </div>
            <div>
              <label for="graphMaxRange">Max range</label>
              <input
                id="graphMaxRange"
                type="number"
                :value="selectedElement.maxRange"
                placeholder="100"
                @input="updateNumber('maxRange', $event)"
              />
            </div>
          </div>

          <div class="display-inspector__row">
            <div>
              <label for="graphMinValue">Min value</label>
              <input
                id="graphMinValue"
                type="number"
                :value="selectedElement.minValue"
                placeholder="0"
                @input="updateNumber('minValue', $event)"
              />
            </div>
            <div>
              <label for="graphMaxValue">Max value</label>
              <input
                id="graphMaxValue"
                type="number"
                :value="selectedElement.maxValue"
                placeholder="100"
                @input="updateNumber('maxValue', $event)"
              />
            </div>
          </div>

          <div>
            <label for="graphUseTraces">Use multiple traces</label>
            <input
              id="graphUseTraces"
              type="checkbox"
              class="schema-checkbox"
              :checked="Boolean(selectedElement.useTraces)"
              @change="updateBool('useTraces', $event)"
            />
          </div>

          <div v-if="!selectedElement.useTraces" class="display-inspector__row">
            <div>
              <label for="graphLineType">Line type</label>
              <select
                id="graphLineType"
                :value="selectedElement.lineType || 'SOLID'"
                @change="updateText('lineType', $event)"
              >
                <option value="SOLID">SOLID</option>
                <option value="DOTTED">DOTTED</option>
                <option value="DASHED">DASHED</option>
              </select>
            </div>
            <div>
              <label for="graphLineThickness">Thickness</label>
              <input
                id="graphLineThickness"
                type="number"
                :value="selectedElement.lineThickness || 3"
                @input="updateNumber('lineThickness', $event)"
              />
            </div>
          </div>

          <div v-if="!selectedElement.useTraces" class="display-inspector__row">
            <div v-if="!isMonochrome" class="display-icon-picker">
              <label for="graphColor">Color</label>
              <div class="schema-icon-row">
                <input
                  id="graphColor"
                  type="text"
                  :value="selectedElement.color"
                  placeholder="#RRGGBB"
                  @input="updateText('color', $event)"
                />
                <button type="button" class="secondary compact schema-icon-btn" @click="openColorPicker">
                  <span class="schema-color-icon" :style="{ backgroundColor: colorSwatch }"></span>
                </button>
              </div>
              <ColorPickerModal
                :open="colorPickerOpen"
                :selected="colorInputValue"
                @close="handleColorClose"
                @select="handleColorSelect"
              />
            </div>
            <div>
              <label for="graphContinuous">Continuous</label>
              <input
                id="graphContinuous"
                type="checkbox"
                class="schema-checkbox"
                :checked="Boolean(selectedElement.continuous)"
                @change="updateBool('continuous', $event)"
              />
            </div>
          </div>

          <div v-else class="display-trace-list">
            <div class="display-trace-header">
              <strong>Traces</strong>
              <button type="button" class="secondary compact" @click="addTrace">Add trace</button>
            </div>
            <div v-if="!selectedElement.traces?.length" class="note">No traces added.</div>
            <div v-for="(trace, index) in selectedElement.traces" :key="index" class="display-trace-card">
              <div class="display-inspector__row">
                <div>
                  <label :for="`traceSensor_${index}`">Sensor</label>
                  <select
                    :id="`traceSensor_${index}`"
                    :value="trace.sensor || ''"
                    @change="updateTrace(index, 'sensor', $event.target.value)"
                  >
                    <option value="">Select sensor</option>
                    <option v-for="entry in graphSensorOptions" :key="entry.id" :value="entry.id">
                      {{ entry.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label :for="`traceName_${index}`">Name</label>
                  <input
                    :id="`traceName_${index}`"
                    type="text"
                    :value="trace.name || ''"
                    @input="updateTrace(index, 'name', $event.target.value)"
                  />
                </div>
              </div>
              <div class="display-inspector__row">
                <div>
                  <label :for="`traceLineType_${index}`">Line type</label>
                  <select
                    :id="`traceLineType_${index}`"
                    :value="trace.lineType || 'SOLID'"
                    @change="updateTrace(index, 'lineType', $event.target.value)"
                  >
                    <option value="SOLID">SOLID</option>
                    <option value="DOTTED">DOTTED</option>
                    <option value="DASHED">DASHED</option>
                  </select>
                </div>
                <div>
                  <label :for="`traceThickness_${index}`">Thickness</label>
                  <input
                    :id="`traceThickness_${index}`"
                    type="number"
                    :value="trace.lineThickness ?? 3"
                    @input="updateTrace(index, 'lineThickness', Number($event.target.value))"
                  />
                </div>
              </div>
              <div class="display-inspector__row">
                <div v-if="!isMonochrome" class="display-icon-picker">
                  <label :for="`traceColor_${index}`">Color</label>
                  <div class="schema-icon-row">
                    <input
                      :id="`traceColor_${index}`"
                      type="text"
                      :value="trace.color || ''"
                      placeholder="#RRGGBB"
                      @input="updateTrace(index, 'color', $event.target.value)"
                    />
                    <button
                      type="button"
                      class="secondary compact schema-icon-btn"
                      @click="openTraceColorPicker(index)"
                    >
                      <span
                        class="schema-color-icon"
                        :style="{ backgroundColor: traceColorSwatch(trace.color) }"
                      ></span>
                    </button>
                  </div>
                </div>
                <div>
                  <label :for="`traceContinuous_${index}`">Continuous</label>
                  <input
                    :id="`traceContinuous_${index}`"
                    type="checkbox"
                    class="schema-checkbox"
                    :checked="Boolean(trace.continuous)"
                    @change="updateTrace(index, 'continuous', $event.target.checked)"
                  />
                </div>
              </div>
              <div class="display-trace-actions">
                <button type="button" class="secondary compact" @click="removeTrace(index)">Remove</button>
              </div>
            </div>
            <ColorPickerModal
              :open="traceColorPickerOpen"
              :selected="activeTraceColor"
              @close="handleTraceColorClose"
              @select="handleTraceColorSelect"
            />
          </div>

          <div>
            <label for="graphLegend">Legend</label>
            <input
              id="graphLegend"
              type="checkbox"
              class="schema-checkbox"
              :checked="Boolean(selectedElement.legendEnabled)"
              @change="handleLegendToggle"
            />
          </div>

          <div v-if="selectedElement.legendEnabled" class="display-legend">
            <div class="display-inspector__row">
              <div>
                <label for="legendNameFontSource">Name font source</label>
                <select
                  id="legendNameFontSource"
                  :value="selectedElement.legendNameFontSource || 'local'"
                  @change="handleLegendNameFontSourceChange"
                >
                  <option value="local">Local</option>
                  <option value="google">Google Fonts</option>
                </select>
              </div>
              <div>
                <label for="legendValueFontSource">Value font source</label>
                <select
                  id="legendValueFontSource"
                  :value="selectedElement.legendValueFontSource || 'local'"
                  @change="handleLegendValueFontSourceChange"
                >
                  <option value="local">Local</option>
                  <option value="google">Google Fonts</option>
                </select>
              </div>
            </div>

            <div
              v-if="(selectedElement.legendNameFontSource || 'local') === 'local'"
              class="display-inspector__row"
            >
              <div>
                <label for="legendNameFontFile">Name font</label>
                <select
                  id="legendNameFontFile"
                  :value="selectedElement.legendNameFontFile"
                  @change="handleLegendNameFontFileChange"
                >
                  <option value="">Select font</option>
                  <option v-for="font in localFonts" :key="font.file" :value="font.file">
                    {{ font.label }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendNameFontSize">Name size</label>
                <input
                  id="legendNameFontSize"
                  type="number"
                  :value="selectedElement.legendNameFontSize || 10"
                  @input="updateNumber('legendNameFontSize', $event)"
                />
              </div>
            </div>

            <div
              v-else
              class="display-inspector__row"
            >
              <div>
                <label for="legendNameFontFamily">Name family</label>
                <select
                  id="legendNameFontFamily"
                  :value="selectedElement.legendNameFontFamily"
                  @change="handleLegendNameFontFamilyChange"
                >
                  <option value="">Select family</option>
                  <option v-for="font in googleFonts" :key="font.family" :value="font.family">
                    {{ font.family }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendNameFontVariant">Variant</label>
                <select
                  id="legendNameFontVariant"
                  :value="selectedElement.legendNameFontVariant || 'regular'"
                  @change="handleLegendNameFontVariantChange"
                >
                  <option
                    v-for="variant in googleFonts.find((item) => item.family === selectedElement.legendNameFontFamily)?.variants || []"
                    :key="variant"
                    :value="variant"
                  >
                    {{ variant }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendNameFontSizeGoogle">Name size</label>
                <input
                  id="legendNameFontSizeGoogle"
                  type="number"
                  :value="selectedElement.legendNameFontSize || 10"
                  @input="updateNumber('legendNameFontSize', $event)"
                />
              </div>
            </div>

            <div
              v-if="(selectedElement.legendValueFontSource || 'local') === 'local'"
              class="display-inspector__row"
            >
              <div>
                <label for="legendValueFontFile">Value font</label>
                <select
                  id="legendValueFontFile"
                  :value="selectedElement.legendValueFontFile"
                  @change="handleLegendValueFontFileChange"
                >
                  <option value="">Select font</option>
                  <option v-for="font in localFonts" :key="font.file" :value="font.file">
                    {{ font.label }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendValueFontSize">Value size</label>
                <input
                  id="legendValueFontSize"
                  type="number"
                  :value="selectedElement.legendValueFontSize || 8"
                  @input="updateNumber('legendValueFontSize', $event)"
                />
              </div>
            </div>

            <div
              v-else
              class="display-inspector__row"
            >
              <div>
                <label for="legendValueFontFamily">Value family</label>
                <select
                  id="legendValueFontFamily"
                  :value="selectedElement.legendValueFontFamily"
                  @change="handleLegendValueFontFamilyChange"
                >
                  <option value="">Select family</option>
                  <option v-for="font in googleFonts" :key="font.family" :value="font.family">
                    {{ font.family }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendValueFontVariant">Variant</label>
                <select
                  id="legendValueFontVariant"
                  :value="selectedElement.legendValueFontVariant || 'regular'"
                  @change="handleLegendValueFontVariantChange"
                >
                  <option
                    v-for="variant in googleFonts.find((item) => item.family === selectedElement.legendValueFontFamily)?.variants || []"
                    :key="variant"
                    :value="variant"
                  >
                    {{ variant }}
                  </option>
                </select>
              </div>
              <div>
                <label for="legendValueFontSizeGoogle">Value size</label>
                <input
                  id="legendValueFontSizeGoogle"
                  type="number"
                  :value="selectedElement.legendValueFontSize || 8"
                  @input="updateNumber('legendValueFontSize', $event)"
                />
              </div>
            </div>

            <div class="display-inspector__row">
              <div>
                <label for="legendWidth">Legend width</label>
                <input
                  id="legendWidth"
                  type="number"
                  :value="selectedElement.legendWidth"
                  placeholder="80"
                  @input="updateNumber('legendWidth', $event)"
                />
              </div>
              <div>
                <label for="legendHeight">Legend height</label>
                <input
                  id="legendHeight"
                  type="number"
                  :value="selectedElement.legendHeight"
                  placeholder="32"
                  @input="updateNumber('legendHeight', $event)"
                />
              </div>
            </div>

            <div class="display-inspector__row">
              <div>
                <label for="legendBorder">Legend border</label>
                <input
                  id="legendBorder"
                  type="checkbox"
                  class="schema-checkbox"
                  :checked="selectedElement.legendBorder !== false"
                  @change="updateBool('legendBorder', $event)"
                />
              </div>
              <div>
                <label for="legendShowLines">Show lines</label>
                <input
                  id="legendShowLines"
                  type="checkbox"
                  class="schema-checkbox"
                  :checked="selectedElement.legendShowLines !== false"
                  @change="updateBool('legendShowLines', $event)"
                />
              </div>
            </div>

            <div class="display-inspector__row">
              <div>
                <label for="legendShowValues">Show values</label>
                <select
                  id="legendShowValues"
                  :value="selectedElement.legendShowValues || 'AUTO'"
                  @change="updateText('legendShowValues', $event)"
                >
                  <option value="NONE">NONE</option>
                  <option value="AUTO">AUTO</option>
                  <option value="BESIDE">BESIDE</option>
                  <option value="BELOW">BELOW</option>
                </select>
              </div>
              <div>
                <label for="legendDirection">Direction</label>
                <select
                  id="legendDirection"
                  :value="selectedElement.legendDirection || 'AUTO'"
                  @change="updateText('legendDirection', $event)"
                >
                  <option value="AUTO">AUTO</option>
                  <option value="HORIZONTAL">HORIZONTAL</option>
                  <option value="VERTICAL">VERTICAL</option>
                </select>
              </div>
            </div>

            <div>
              <label for="legendShowUnits">Show units</label>
              <input
                id="legendShowUnits"
                type="checkbox"
                class="schema-checkbox"
                :checked="selectedElement.legendShowUnits !== false"
                @change="updateBool('legendShowUnits', $event)"
              />
            </div>
          </div>
        </template>

        <div v-if="selectedElement.type === 'icon'" class="display-icon-picker">
          <label for="iconValue">Icon</label>
          <div class="schema-icon-row">
            <input
              id="iconValue"
              type="text"
              :value="iconInputValue"
              :class="{ 'field-error': iconRequiredError }"
              placeholder="mdi:home-thermometer"
              @input="updateText('icon', $event)"
            />
            <button type="button" class="secondary compact schema-icon-btn" @click="openIconPicker">
              <img
                :src="iconButtonUrl"
                alt="Add icon"
              />
            </button>
          </div>
          <div v-if="iconRequiredError" class="field-error-text">
            {{ iconErrorText }}
          </div>
          <IconPicker
            :open="iconPickerOpen"
            :selected="iconName"
            :initial-query="iconQuery"
            @close="handleIconClose"
            @select="handleIconSelect"
          />
        </div>
        <div v-if="selectedElement.type === 'icon' && !isMonochrome" class="display-icon-picker">
          <label for="iconColor">Color</label>
          <div class="schema-icon-row">
            <input
              id="iconColor"
              type="text"
              :value="colorInputValue"
              placeholder="#RRGGBB"
              @input="updateText('color', $event)"
            />
            <button type="button" class="secondary compact schema-icon-btn" @click="openColorPicker">
              <span class="schema-color-icon" :style="{ backgroundColor: colorSwatch }"></span>
            </button>
          </div>
          <ColorPickerModal
            :open="colorPickerOpen"
            :selected="colorInputValue"
            @close="handleColorClose"
            @select="handleColorSelect"
          />
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import IconPicker from "../IconPicker.vue";
import ColorPickerModal from "../ColorPickerModal.vue";
import { colorToCss } from "../../utils/displayColor";

const props = defineProps({
  selectedElement: {
    type: Object,
    default: null
  },
  screenW: {
    type: Number,
    default: 0
  },
  screenH: {
    type: Number,
    default: 0
  },
  isMonochrome: {
    type: Boolean,
    default: true
  },
  images: {
    type: Array,
    default: () => []
  },
  localFonts: {
    type: Array,
    default: () => []
  },
  googleFonts: {
    type: Array,
    default: () => []
  },
  assetsBase: {
    type: String,
    default: "/"
  },
  dynamicIds: {
    type: Array,
    default: () => []
  },
  mdiIcons: {
    type: Array,
    default: () => []
  },
  variant: {
    type: String,
    default: "card"
  },
  showHeader: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(["update"]);

const iconPickerOpen = ref(false);
const colorPickerOpen = ref(false);
const traceColorPickerOpen = ref(false);
const activeTraceIndex = ref(null);

const rotationOptions = [0, 90, 180, 270];
const showRotation = computed(() =>
  ["shape"].includes(props.selectedElement?.type)
);

const showColorPicker = computed(() => {
  if (props.isMonochrome) return false;
  const type = props.selectedElement?.type;
  return ["text", "shape"].includes(type);
});

const shapeHint = computed(() => {
  const type = props.selectedElement?.type;
  if (type !== "shape") return "";
  const shape = props.selectedElement?.shapeType;
  if (shape === "line") return "Line uses X/Y and W/H as end point.";
  if (shape === "rect") return "Rectangle uses X/Y and W/H.";
  if (shape === "circle") return "Circle uses X/Y and W/H as bounds.";
  if (shape === "triangle") return "Triangle uses X/Y and W/H as bounds.";
  if (shape?.startsWith("polygon")) return "Polygon uses X/Y and W/H as bounds.";
  return "";
});

const updateNumber = (key, event) => {
  const value = Number(event.target.value);
  if (Number.isNaN(value)) return;
  if (["w", "h"].includes(key) && ["image", "icon", "animation"].includes(props.selectedElement?.type)) {
    const currentW = Number(props.selectedElement?.w || 0);
    const currentH = Number(props.selectedElement?.h || 0);
    const ratio = currentH ? currentW / currentH : 1;
    const nextValue = Math.max(1, Math.round(value));
    if (key === "w") {
      const nextH = Math.max(1, Math.round(nextValue / (ratio || 1)));
      emit("update", { w: nextValue, h: nextH });
      return;
    }
    const nextW = Math.max(1, Math.round(nextValue * (ratio || 1)));
    emit("update", { w: nextW, h: nextValue });
    return;
  }
  emit("update", { [key]: value });
};

const updateText = (key, event) => {
  emit("update", { [key]: event.target.value });
};

const updateBool = (key, event) => {
  emit("update", { [key]: event.target.checked });
};

const updateBoolSelect = (key, event) => {
  emit("update", { [key]: event.target.value === "true" });
};

const addTrace = () => {
  const next = [
    ...(props.selectedElement?.traces || []),
    {
      sensor: "",
      name: "",
      lineType: "SOLID",
      lineThickness: 3,
      continuous: false,
      color: ""
    }
  ];
  emit("update", { traces: next });
};

const updateTrace = (index, key, value) => {
  const next = [...(props.selectedElement?.traces || [])];
  const current = next[index] || {};
  next[index] = { ...current, [key]: value };
  emit("update", { traces: next });
};

const removeTrace = (index) => {
  const next = [...(props.selectedElement?.traces || [])];
  next.splice(index, 1);
  emit("update", { traces: next });
};

const iconInputValue = computed(() => {
  const value = props.selectedElement?.icon || "";
  if (!value || value === "placeholder") return "";
  return value;
});

const iconName = computed(() => {
  const value = props.selectedElement?.icon || "";
  if (!value || value === "placeholder") return "";
  return value.startsWith("mdi:") ? value.slice(4) : value;
});

const iconQuery = computed(() => iconName.value);

const iconButtonUrl = computed(() => {
  if (!iconName.value) {
    return "https://cdn.jsdelivr.net/npm/@mdi/svg/svg/emoticon-plus-outline.svg";
  }
  return `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${iconName.value}.svg`;
});

const iconRequiredError = computed(() => {
  if (props.selectedElement?.type !== "icon") return false;
  if (!props.mdiIcons?.length) return true;
  const value = iconName.value || "";
  if (!value.trim()) return true;
  return !props.mdiIcons.some((icon) => icon.toLowerCase() === value.toLowerCase());
});

const iconErrorText = computed(() => {
  if (!props.mdiIcons?.length) return "No MDI icons available.";
  if (!iconName.value) return "Please select an icon.";
  return "Invalid MDI icon name.";
});

const colorInputValue = computed(() => props.selectedElement?.color || "");

const colorSwatch = computed(() => {
  if (!colorInputValue.value) return "#ffffff";
  return colorToCss(colorInputValue.value, "#ffffff");
});

const traceColorSwatch = (value) => colorToCss(value || "", "#ffffff");

const activeTraceColor = computed(() => {
  const index = activeTraceIndex.value;
  if (index === null || index === undefined) return "";
  const traces = props.selectedElement?.traces || [];
  return traces[index]?.color || "";
});

const graphSensorOptions = computed(() =>
  (props.dynamicIds || [])
    .filter((entry) => entry.domain === "sensor")
    .map((entry) => ({ id: entry.id, label: entry.label }))
    .sort((a, b) => a.label.localeCompare(b.label))
);

const dynamicIdOptions = computed(() => {
  const domain = props.selectedElement?.dynamicDomain || "";
  const list = props.dynamicIds || [];
  if (!domain) return list;
  return list.filter((entry) => entry.domain === domain);
});

const dynamicIdRequiredError = computed(() => {
  if (props.selectedElement?.type !== "text") return false;
  if ((props.selectedElement?.textMode || "static") !== "dynamic") return false;
  if (!dynamicIdOptions.value.length) return true;
  const selected = props.selectedElement?.dynamicId || "";
  if (!selected) return true;
  return !dynamicIdOptions.value.some((entry) => entry.id === selected);
});

const dynamicIdErrorText = computed(() => {
  if (!dynamicIdOptions.value.length) return "No source IDs available.";
  return "Please select a source ID.";
});

const graphIdRequiredError = computed(() => {
  if (props.selectedElement?.type !== "graph") return false;
  return !String(props.selectedElement?.graphId || "").trim();
});

const graphDurationRequiredError = computed(() => {
  if (props.selectedElement?.type !== "graph") return false;
  return !String(props.selectedElement?.duration || "").trim();
});

const graphSensorRequiredError = computed(() => {
  if (props.selectedElement?.type !== "graph") return false;
  if (props.selectedElement?.useTraces) return false;
  if (!graphSensorOptions.value.length) return true;
  const selected = props.selectedElement?.sensor || "";
  if (!selected) return true;
  return !graphSensorOptions.value.some((entry) => entry.id === selected);
});

const graphSensorErrorText = computed(() => {
  if (!graphSensorOptions.value.length) return "No sensor IDs available.";
  return "Please select a sensor ID.";
});

const animationFiles = computed(() =>
  (props.images || [])
    .map((item) => item?.file || "")
    .filter((file) => file.toLowerCase().endsWith(".gif"))
    .sort((a, b) => a.localeCompare(b))
);

const imageFiles = computed(() =>
  (props.images || [])
    .map((item) => item?.file || "")
    .filter((file) => Boolean(file))
    .sort((a, b) => a.localeCompare(b))
);

const animationIdRequiredError = computed(() => {
  if (props.selectedElement?.type !== "animation") return false;
  return !String(props.selectedElement?.animationId || "").trim();
});

const animationFileRequiredError = computed(() => {
  if (props.selectedElement?.type !== "animation") return false;
  if (!animationFiles.value.length) return true;
  const selected = props.selectedElement?.animationFile || "";
  if (!selected) return true;
  return !animationFiles.value.includes(selected);
});

const animationFileErrorText = computed(() => {
  if (!animationFiles.value.length) return "No GIF animations available.";
  return "Please select an animation file.";
});

const imageFileRequiredError = computed(() => {
  if (props.selectedElement?.type !== "image") return false;
  if (!imageFiles.value.length) return true;
  const selected = props.selectedElement?.image || "";
  if (!selected) return true;
  return !imageFiles.value.includes(selected);
});

const imageFileErrorText = computed(() => {
  if (!imageFiles.value.length) return "No image files available.";
  return "Please select an image file.";
});



const openIconPicker = () => {
  iconPickerOpen.value = true;
};

const handleIconClose = () => {
  iconPickerOpen.value = false;
};

const handleIconSelect = (name) => {
  emit("update", { icon: name ? `mdi:${name}` : "" });
  iconPickerOpen.value = false;
};

const openColorPicker = () => {
  colorPickerOpen.value = true;
};

const handleColorClose = () => {
  colorPickerOpen.value = false;
};

const handleColorSelect = (value) => {
  emit("update", { color: value || "" });
  colorPickerOpen.value = false;
};

const openTraceColorPicker = (index) => {
  activeTraceIndex.value = index;
  traceColorPickerOpen.value = true;
};

const handleTraceColorClose = () => {
  traceColorPickerOpen.value = false;
  activeTraceIndex.value = null;
};

const handleTraceColorSelect = (value) => {
  const index = activeTraceIndex.value;
  if (index !== null && index !== undefined) {
    updateTrace(index, "color", value || "");
  }
  traceColorPickerOpen.value = false;
  activeTraceIndex.value = null;
};

const updatePatch = (patch) => {
  emit("update", patch);
};

const deriveVariantStyle = (variant) => {
  const value = `${variant || ""}`.toLowerCase();
  const style = value.includes("italic") ? "italic" : "normal";
  const weight = Number.parseInt(value, 10) || 400;
  return { weight, style };
};

const deriveLocalStyle = (label, fileName) => {
  const value = `${label || ""} ${fileName || ""}`.toLowerCase();
  const style = value.includes("italic") ? "italic" : "normal";
  let weight = 400;
  if (value.includes("thin")) weight = 100;
  else if (value.includes("extralight") || value.includes("extra light")) weight = 200;
  else if (value.includes("light")) weight = 300;
  else if (value.includes("medium")) weight = 500;
  else if (value.includes("semibold") || value.includes("semi bold")) weight = 600;
  else if (value.includes("bold")) weight = 700;
  else if (value.includes("extrabold") || value.includes("extra bold")) weight = 800;
  else if (value.includes("black")) weight = 900;
  return { weight, style };
};

const handleFontSourceChange = (event) => {
  const source = event.target.value;
  if (source === "google") {
    const family = props.googleFonts[0];
    const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
    const url = family?.files?.[variant] || "";
    const { weight, style } = deriveVariantStyle(variant);
    updatePatch({
      fontSource: "google",
      fontFamily: family?.family || "",
      fontVariant: variant || "regular",
      fontUrl: url,
      fontFile: "",
      fontWeight: weight,
      fontStyle: style
    });
    return;
  }

  const local = props.localFonts[0];
  const styleInfo = deriveLocalStyle(local?.label, local?.file);
  updatePatch({
    fontSource: "local",
    fontFamily: local?.label || "",
    fontFile: local?.file || "",
    fontVariant: "regular",
    fontUrl: local?.file ? `${props.assetsBase}fonts/${local.file}` : "",
    fontWeight: styleInfo.weight,
    fontStyle: styleInfo.style
  });
};

const handleLocalFontChange = (event) => {
  const file = event.target.value;
  const font = props.localFonts.find((item) => item.file === file);
  const styleInfo = deriveLocalStyle(font?.label, font?.file);
  updatePatch({
    fontSource: "local",
    fontFamily: font?.label || "",
    fontFile: font?.file || "",
    fontVariant: "regular",
    fontUrl: font?.file ? `${props.assetsBase}fonts/${font.file}` : "",
    fontWeight: styleInfo.weight,
    fontStyle: styleInfo.style
  });
};

const handleGoogleFamilyChange = (event) => {
  const familyName = event.target.value;
  const family = props.googleFonts.find((item) => item.family === familyName);
  const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    fontSource: "google",
    fontFamily: family?.family || "",
    fontVariant: variant || "regular",
    fontUrl: url,
    fontFile: "",
    fontWeight: weight,
    fontStyle: style
  });
};

const handleGoogleVariantChange = (event) => {
  const variant = event.target.value;
  const family = props.googleFonts.find((item) => item.family === props.selectedElement?.fontFamily);
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    fontSource: "google",
    fontVariant: variant,
    fontUrl: url,
    fontWeight: weight,
    fontStyle: style
  });
};

const handleLegendNameFontSourceChange = (event) => {
  const source = event.target.value;
  if (source === "google") {
    const family = props.googleFonts[0];
    const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
    const url = family?.files?.[variant] || "";
    const { weight, style } = deriveVariantStyle(variant);
    updatePatch({
      legendNameFontSource: "google",
      legendNameFontFamily: family?.family || "",
      legendNameFontVariant: variant || "regular",
      legendNameFontFile: "",
      legendNameFontUrl: url,
      legendNameFontWeight: weight,
      legendNameFontStyle: style
    });
    return;
  }
  const local = props.localFonts[0];
  const styleInfo = deriveLocalStyle(local?.label, local?.file);
  updatePatch({
    legendNameFontSource: "local",
    legendNameFontFamily: local?.label || "",
    legendNameFontFile: local?.file || "",
    legendNameFontVariant: "regular",
    legendNameFontUrl: local?.file ? `${props.assetsBase}fonts/${local.file}` : "",
    legendNameFontWeight: styleInfo.weight,
    legendNameFontStyle: styleInfo.style
  });
};

const handleLegendValueFontSourceChange = (event) => {
  const source = event.target.value;
  if (source === "google") {
    const family = props.googleFonts[0];
    const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
    const url = family?.files?.[variant] || "";
    const { weight, style } = deriveVariantStyle(variant);
    updatePatch({
      legendValueFontSource: "google",
      legendValueFontFamily: family?.family || "",
      legendValueFontVariant: variant || "regular",
      legendValueFontFile: "",
      legendValueFontUrl: url,
      legendValueFontWeight: weight,
      legendValueFontStyle: style
    });
    return;
  }
  const local = props.localFonts[0];
  const styleInfo = deriveLocalStyle(local?.label, local?.file);
  updatePatch({
    legendValueFontSource: "local",
    legendValueFontFamily: local?.label || "",
    legendValueFontFile: local?.file || "",
    legendValueFontVariant: "regular",
    legendValueFontUrl: local?.file ? `${props.assetsBase}fonts/${local.file}` : "",
    legendValueFontWeight: styleInfo.weight,
    legendValueFontStyle: styleInfo.style
  });
};

const handleLegendNameFontFileChange = (event) => {
  const file = event.target.value;
  const font = props.localFonts.find((item) => item.file === file);
  const styleInfo = deriveLocalStyle(font?.label, font?.file);
  updatePatch({
    legendNameFontSource: "local",
    legendNameFontFamily: font?.label || "",
    legendNameFontFile: font?.file || "",
    legendNameFontVariant: "regular",
    legendNameFontUrl: font?.file ? `${props.assetsBase}fonts/${font.file}` : "",
    legendNameFontWeight: styleInfo.weight,
    legendNameFontStyle: styleInfo.style
  });
};

const handleLegendValueFontFileChange = (event) => {
  const file = event.target.value;
  const font = props.localFonts.find((item) => item.file === file);
  const styleInfo = deriveLocalStyle(font?.label, font?.file);
  updatePatch({
    legendValueFontSource: "local",
    legendValueFontFamily: font?.label || "",
    legendValueFontFile: font?.file || "",
    legendValueFontVariant: "regular",
    legendValueFontUrl: font?.file ? `${props.assetsBase}fonts/${font.file}` : "",
    legendValueFontWeight: styleInfo.weight,
    legendValueFontStyle: styleInfo.style
  });
};

const handleLegendNameFontFamilyChange = (event) => {
  const familyName = event.target.value;
  const family = props.googleFonts.find((item) => item.family === familyName);
  const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    legendNameFontSource: "google",
    legendNameFontFamily: family?.family || "",
    legendNameFontVariant: variant || "regular",
    legendNameFontFile: "",
    legendNameFontUrl: url,
    legendNameFontWeight: weight,
    legendNameFontStyle: style
  });
};

const handleLegendValueFontFamilyChange = (event) => {
  const familyName = event.target.value;
  const family = props.googleFonts.find((item) => item.family === familyName);
  const variant = family?.variants?.includes("regular") ? "regular" : family?.variants?.[0];
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    legendValueFontSource: "google",
    legendValueFontFamily: family?.family || "",
    legendValueFontVariant: variant || "regular",
    legendValueFontFile: "",
    legendValueFontUrl: url,
    legendValueFontWeight: weight,
    legendValueFontStyle: style
  });
};

const handleLegendNameFontVariantChange = (event) => {
  const variant = event.target.value;
  const family = props.googleFonts.find((item) => item.family === props.selectedElement?.legendNameFontFamily);
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    legendNameFontSource: "google",
    legendNameFontVariant: variant,
    legendNameFontUrl: url,
    legendNameFontWeight: weight,
    legendNameFontStyle: style
  });
};

const handleLegendValueFontVariantChange = (event) => {
  const variant = event.target.value;
  const family = props.googleFonts.find((item) => item.family === props.selectedElement?.legendValueFontFamily);
  const url = family?.files?.[variant] || "";
  const { weight, style } = deriveVariantStyle(variant);
  updatePatch({
    legendValueFontSource: "google",
    legendValueFontVariant: variant,
    legendValueFontUrl: url,
    legendValueFontWeight: weight,
    legendValueFontStyle: style
  });
};

const handleAnimationFileChange = (event) => {
  const file = event.target.value;
  const animationUrl = file ? `${props.assetsBase}images/${file}` : "";
  updatePatch({
    animationFile: file,
    animationUrl
  });
  if (!animationUrl) return;
  const probe = new Image();
  probe.src = animationUrl;
  probe.onload = () => {
    const width = probe.naturalWidth || probe.width || 0;
    const height = probe.naturalHeight || probe.height || 0;
    if (!width || !height) return;
    let nextW = width;
    let nextH = height;
    const maxW = Number(props.screenW || 0);
    const maxH = Number(props.screenH || 0);
    if (maxW > 0 && maxH > 0 && (width > maxW || height > maxH)) {
      const scale = Math.min(maxW / width, maxH / height, 1);
      nextW = Math.max(1, Math.round(width * scale));
      nextH = Math.max(1, Math.round(height * scale));
    }
    updatePatch({ w: nextW, h: nextH });
  };
};

const getDefaultLegendFont = (size) => {
  const local = props.localFonts[0];
  if (local) {
    const styleInfo = deriveLocalStyle(local?.label, local?.file);
    return {
      source: "local",
      family: local?.label || "",
      file: local?.file || "",
      variant: "regular",
      url: local?.file ? `${props.assetsBase}fonts/${local.file}` : "",
      weight: styleInfo.weight,
      style: styleInfo.style,
      size
    };
  }
  const google = props.googleFonts[0];
  if (google) {
    const variant = google.variants?.includes("regular") ? "regular" : google.variants?.[0];
    const url = google.files?.[variant] || "";
    const { weight, style } = deriveVariantStyle(variant);
    return {
      source: "google",
      family: google.family,
      file: "",
      variant: variant || "regular",
      url,
      weight,
      style,
      size
    };
  }
  return null;
};

const handleLegendToggle = (event) => {
  const enabled = event.target.checked;
  if (!enabled) {
    updatePatch({ legendEnabled: false });
    return;
  }
  const patch = { legendEnabled: true };
  const nameSet = props.selectedElement?.legendNameFontFile || props.selectedElement?.legendNameFontFamily;
  const valueSet = props.selectedElement?.legendValueFontFile || props.selectedElement?.legendValueFontFamily;
  if (!nameSet) {
    const font = getDefaultLegendFont(props.selectedElement?.legendNameFontSize || 10);
    if (font) {
      patch.legendNameFontSource = font.source;
      patch.legendNameFontFamily = font.family;
      patch.legendNameFontFile = font.file;
      patch.legendNameFontVariant = font.variant;
      patch.legendNameFontUrl = font.url;
      patch.legendNameFontWeight = font.weight;
      patch.legendNameFontStyle = font.style;
    }
  }
  if (!valueSet) {
    const font = getDefaultLegendFont(props.selectedElement?.legendValueFontSize || 8);
    if (font) {
      patch.legendValueFontSource = font.source;
      patch.legendValueFontFamily = font.family;
      patch.legendValueFontFile = font.file;
      patch.legendValueFontVariant = font.variant;
      patch.legendValueFontUrl = font.url;
      patch.legendValueFontWeight = font.weight;
      patch.legendValueFontStyle = font.style;
    }
  }
  updatePatch(patch);
};

const handleImageChange = (event) => {
  const file = event.target.value;
  const image = props.images.find((item) => item.file === file);
  const imageUrl = image?.file ? `${props.assetsBase}images/${image.file}` : "";
  updatePatch({
    image: image?.file || "",
    imageUrl
  });
  if (!imageUrl) return;
  const probe = new Image();
  probe.src = imageUrl;
  probe.onload = () => {
    const width = probe.naturalWidth || probe.width || 0;
    const height = probe.naturalHeight || probe.height || 0;
    if (!width || !height) return;
    let nextW = width;
    let nextH = height;
    const maxW = Number(props.screenW || 0);
    const maxH = Number(props.screenH || 0);
    if (maxW > 0 && maxH > 0 && (width > maxW || height > maxH)) {
      const scale = Math.min(maxW / width, maxH / height, 1);
      nextW = Math.max(1, Math.round(width * scale));
      nextH = Math.max(1, Math.round(height * scale));
    }
    updatePatch({ w: nextW, h: nextH });
  };
};

const dynamicModeOptions = [
  { value: "static", label: "Static text" },
  { value: "dynamic", label: "Dynamic value" }
];

const isNumericDomain = (domain) => ["sensor", "number"].includes(domain);
const isBinaryDomain = (domain) => ["binary_sensor", "switch"].includes(domain);
</script>

<style scoped>
.display-inspector {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  background: #f8fafc;
  display: grid;
  gap: 12px;
  align-content: start;
}

.display-inspector--flat {
  border: none;
  padding: 0;
  background: transparent;
}

.display-inspector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.display-inspector__header h4 {
  margin: 0;
  font-size: 14px;
}

.display-inspector__type {
  background: #0f172a;
  color: #f8fafc;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  font-weight: 700;
}

.display-inspector__form {
  display: grid;
  gap: 10px;
}

.display-inspector__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.display-inspector__row input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
}

.display-inspector__row input[type="number"]::-webkit-outer-spin-button,
.display-inspector__row input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.display-inspector__row--quad {
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto repeat(2, minmax(0, 1fr));
  align-items: end;
}

.display-inspector__field {
  min-width: 0;
}

.display-inspector__group-divider {
  width: 1px;
  height: 48px;
  background: #e2e8f0;
  align-self: center;
}

.field-error {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.4);
}

.field-error-text {
  margin-top: 4px;
  color: #ef4444;
  font-size: 11px;
}

select.field-error {
  color: #0f172a;
}

.display-trace-list {
  display: grid;
  gap: 10px;
}

.display-trace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.display-trace-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
  display: grid;
  gap: 10px;
}

.display-trace-actions {
  display: flex;
  justify-content: flex-end;
}

.display-legend {
  display: grid;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #ffffff;
}

.display-icon-picker input {
  cursor: text;
}

:deep(.schema-icon-row) {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: stretch;
  width: 100%;
}

:deep(.schema-icon-row input) {
  min-width: 0;
}

:deep(.schema-icon-btn) {
  width: auto;
  height: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  border-radius: 4px;
  background: #6190d6;
  border: 1px solid #6e93c4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

:deep(.schema-icon-btn img) {
  width: 18px;
  height: 18px;
  filter: brightness(0) invert(1);
}

:deep(.schema-color-icon) {
  width: 18px;
  height: 18px;
  display: inline-block;
  mask-image: url("https://cdn.jsdelivr.net/npm/@mdi/svg/svg/palette.svg");
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  -webkit-mask-image: url("https://cdn.jsdelivr.net/npm/@mdi/svg/svg/palette.svg");
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
}

</style>
