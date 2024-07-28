import OptionsSync from "webext-options-sync"

const defaultOptions = {
  previewCount: true,
  dropdown: "compact",
  participating: false
}

const ExtensionOptions = new OptionsSync({
  defaults: defaultOptions
})

export { ExtensionOptions }
export type ExtensionOptions = typeof defaultOptions
