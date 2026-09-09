const sheets = ['haven-achievements-01-20-v1.png', 'haven-achievements-21-40-v1.png'];

/** The same atlas crop in the achievements panel and unlock banner. */
export function achievementArt(number) {
  if (!Number.isInteger(number) || number < 1 || number > 40) return null;
  const index = (number - 1) % 20;
  return {
    src: `/icons/achievements/${sheets[Math.floor((number - 1) / 20)]}`,
    position: `${index % 5 * 25}% ${Math.floor(index / 5) * 100 / 3}%`,
    size: '500% 400%',
  };
}
