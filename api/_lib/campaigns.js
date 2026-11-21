// The campaigns Admin → Campanii shows (the owner, 21.11: „să aleg ce campanie văd”), one picker at the top of the section.
// A new campaign: one line here (its key, its name, the module that answers view()), and its screen in portal-transformare.js
// (VIEWS). The first one is the section's own, with its switches (api/portal-transformare.js).
const LIST = [
  { key: 'transformarea', name: 'Transformarea 360', lib: './fc-campaign' },
  { key: 'card', name: 'Cardul de Sărbători', lib: './card-kpi' },
];
const find = (key) => LIST.find((c) => c.key === key) || LIST[0];
const names = () => LIST.map((c) => ({ key: c.key, name: c.name }));
const lib = (c) => require(c.lib); // resolved from here
module.exports = { LIST, find, names, lib };
