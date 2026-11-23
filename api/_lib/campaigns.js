// The campaigns Admin → Campanii shows (the owner, 21.11: „să aleg ce campanie văd”), one picker at the top of the section.
// A new campaign: one line here (its key, its name, the module that answers view()), and its screen in portal-transformare.js
// (VIEWS). The first one is the section's own, with its switches (api/portal-transformare.js).
const LIST = [
  // Transformarea 360: dropped by the owner (23.11), out of the picker (its module stays: card-blast, webhooks read it)
  { key: 'transformarea', name: 'Transformarea 360', lib: './fc-campaign', hidden: true },
  { key: 'card', name: 'Cardul de Sărbători', lib: './card-kpi' },
];
const find = (key) => LIST.find((c) => c.key === key && !c.hidden) || LIST.find((c) => !c.hidden);
const names = () => LIST.filter((c) => !c.hidden).map((c) => ({ key: c.key, name: c.name }));
// static requires: the Worker's bundle can't follow a require with a computed path (it failed in the portal, 21.11)
const LIBS = { './fc-campaign': () => require('./fc-campaign'), './card-kpi': () => require('./card-kpi') };
const lib = (c) => LIBS[c.lib]();
module.exports = { LIST, find, names, lib };
