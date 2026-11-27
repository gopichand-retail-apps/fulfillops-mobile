import model from "../../public/orderflow.model.json"

const content = model.locales[model.defaultLocale as keyof typeof model.locales]
export type Label = keyof typeof content

export function text(key: Label): string {
  return content[key]
}
export function message(code: string): string {
  return Object.hasOwn(content, code) ? text(code as Label) : content.UNKNOWN
}
