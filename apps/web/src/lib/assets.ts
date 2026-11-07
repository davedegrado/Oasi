/** Percorso di una foto dimostrativa, compatibile con base URL relativi */
export const photo = (file: string) => `${import.meta.env?.BASE_URL ?? '/'}images/photos/${file}.webp`

/** File statico della cartella public, compatibile con base URL relativi */
export const asset = (path: string) => `${import.meta.env?.BASE_URL ?? '/'}${path}`
