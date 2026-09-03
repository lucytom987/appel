export const formatElevatorLabel = (elevator) => {
  const number = String(elevator?.brojDizala || '').trim();
  const description = String(elevator?.brojDizalaOpis || elevator?.opisDizala || '').trim();

  if (!number && !description) return 'Dizalo';
  if (!description) return number || 'Dizalo';
  return `${number || 'Dizalo'} (${description})`;
};