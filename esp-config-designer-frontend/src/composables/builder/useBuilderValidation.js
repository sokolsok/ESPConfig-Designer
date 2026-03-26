import { computed } from "vue";

// This composable only assembles validation/indexing layers from helpers already
// defined in BuilderView. Keeping the assembly here makes BuilderView easier to read
// without changing the existing validation rules or their source of truth.

export const useBuilderValidation = ({
  schemaEntries,
  displayImages,
  mdiIcons,
  buildValueRegistry,
  buildIdIndex,
  buildDuplicateErrors,
  buildIdRefErrors,
  buildDisplayElementIdErrors,
  buildValidationErrors
}) => {
  const idRegistry = computed(() =>
    buildValueRegistry(schemaEntries.value, (field, value) =>
      field.type === "id" && typeof value === "string" && value.trim()
    )
  );

  const idIndex = computed(() => buildIdIndex(schemaEntries.value));

  const displayImageFiles = computed(() =>
    displayImages.value
      .map((item) => item?.file || "")
      .filter((file) => Boolean(file))
  );

  const displayAnimationFiles = computed(() =>
    displayImageFiles.value.filter((file) => file.toLowerCase().endsWith(".gif"))
  );

  const nameRegistry = computed(() =>
    buildValueRegistry(schemaEntries.value, (field, value) =>
      field.key === "name" && typeof value === "string" && value.trim()
    )
  );

  const duplicateErrors = computed(() =>
    buildDuplicateErrors(schemaEntries.value, idRegistry.value, nameRegistry.value)
  );

  const idRefErrors = computed(() => buildIdRefErrors(schemaEntries.value, idIndex.value));

  const displayElementIdErrors = computed(() =>
    buildDisplayElementIdErrors(
      schemaEntries.value,
      idIndex.value,
      displayImageFiles.value,
      displayAnimationFiles.value,
      mdiIcons.value
    )
  );

  const validationErrors = computed(() => buildValidationErrors(schemaEntries.value));

  const formErrors = computed(() => [
    ...duplicateErrors.value,
    ...idRefErrors.value,
    ...displayElementIdErrors.value,
    ...validationErrors.value
  ]);

  const formErrorScopeIds = computed(
    () => new Set(formErrors.value.map((entry) => entry.scopeId).filter(Boolean))
  );

  const hasTabErrors = (tab) => formErrorScopeIds.value.has(`tab:${tab}`);

  return {
    displayElementIdErrors,
    formErrors,
    formErrorScopeIds,
    hasTabErrors,
    idIndex,
    idRefErrors,
    idRegistry,
    nameRegistry,
    validationErrors
  };
};
