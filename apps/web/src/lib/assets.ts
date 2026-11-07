/** Percorso di una foto dimostrativa, compatibile con base URL relativi */
export const photo = (file: string) => `${import.meta.env?.BASE_URL ?? '/'}images/photos/${file}.webp`
