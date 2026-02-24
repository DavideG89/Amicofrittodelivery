export type SauceMode = 'paid_multi' | 'free_single' | 'none'

export type SauceRule = {
  sauce_mode: SauceMode
  max_sauces: number
  sauce_price: number
}

export const DEFAULT_SAUCE_RULE: SauceRule = {
  sauce_mode: 'free_single',
  max_sauces: 1,
  sauce_price: 0,
}

const toNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const normalizeSauceRule = (value: Partial<SauceRule> | null | undefined): SauceRule => {
  const modeRaw = value?.sauce_mode
  const sauce_mode: SauceMode =
    modeRaw === 'paid_multi' || modeRaw === 'free_single' || modeRaw === 'none'
      ? modeRaw
      : DEFAULT_SAUCE_RULE.sauce_mode

  const max_sauces = Math.max(0, Math.min(10, Math.floor(toNumber(value?.max_sauces, DEFAULT_SAUCE_RULE.max_sauces))))
  const sauce_price = Math.max(0, Math.round(toNumber(value?.sauce_price, DEFAULT_SAUCE_RULE.sauce_price) * 100) / 100)

  if (sauce_mode === 'none') {
    return { sauce_mode, max_sauces: 0, sauce_price: 0 }
  }
  if (sauce_mode === 'free_single') {
    return { sauce_mode, max_sauces: 1, sauce_price: 0 }
  }

  return {
    sauce_mode,
    max_sauces: Math.max(1, max_sauces),
    sauce_price,
  }
}

export const getFallbackSauceRuleByCategorySlug = (slugRaw: string | null | undefined): SauceRule => {
  const slug = (slugRaw || '').trim().toLowerCase()
  const isMini = slug === 'mini' || slug.includes('mini')
  const isHamburger = slug === 'hamburger' || slug === 'hamburgers' || slug.includes('burger')
  if (isMini || isHamburger) {
    return {
      sauce_mode: 'paid_multi',
      max_sauces: 3,
      sauce_price: 0.5,
    }
  }
  return DEFAULT_SAUCE_RULE
}
