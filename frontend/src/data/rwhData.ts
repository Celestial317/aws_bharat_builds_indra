export interface RWHComponent {
  id: string;
  name: string;
  function: string;
  maintenanceTip: string;
  color: string;
  emissiveColor: string;
}

export const rwhComponents: Record<string, RWHComponent> = {
  catchment: {
    id: "catchment",
    name: "Catchment Area (Roof)",
    function:
      "The roof acts as the primary collection surface for rainwater. Its size and material determine the volume and quality of water collected.",
    maintenanceTip:
      "Keep the roof clean and free from debris. Inspect regularly for cracks or damage that could contaminate the water.",
    color: "#3d4555",
    emissiveColor: "#5a6a7a",
  },
  gutters: {
    id: "gutters",
    name: "Gutters & Channels",
    function:
      "Gutters collect rainwater from the roof edges and channel it towards the downspouts. They're essential for directing water flow efficiently.",
    maintenanceTip:
      "Clean gutters at least twice a year to remove leaves and debris. Check for proper slope to ensure water flows correctly.",
    color: "#2d9e9e",
    emissiveColor: "#4dcece",
  },
  downspout: {
    id: "downspout",
    name: "Downspouts",
    function:
      "Vertical pipes that carry collected rainwater from the gutters down to the ground level, connecting to the filtration system.",
    maintenanceTip:
      "Ensure downspouts are securely attached and free from blockages. Install leaf guards at the top to prevent clogging.",
    color: "#2d9e9e",
    emissiveColor: "#4dcece",
  },
  firstFlush: {
    id: "firstFlush",
    name: "First Flush Diverter",
    function:
      "Diverts the initial dirty water (containing roof contaminants) away from the storage tank. This significantly improves water quality.",
    maintenanceTip:
      "Empty and clean the first flush chamber after each significant rainfall. Check the ball valve for proper operation.",
    color: "#e6a23c",
    emissiveColor: "#ffc966",
  },
  leafFilter: {
    id: "leafFilter",
    name: "Leaf Eater / Filter",
    function:
      "A mesh screen that prevents leaves, twigs, and large debris from entering the system while allowing water to pass through.",
    maintenanceTip:
      "Clean the mesh screen monthly during fall season. Replace damaged screens immediately to maintain water quality.",
    color: "#4a9b6d",
    emissiveColor: "#6bc992",
  },
  tank: {
    id: "tank",
    name: "Storage Tank",
    function:
      "Stores collected and filtered rainwater for later use. Capacity ranges from small barrels to large underground cisterns.",
    maintenanceTip:
      "Inspect the tank annually for cracks and algae growth. Keep it covered to prevent mosquito breeding and contamination.",
    color: "#4a7ab0",
    emissiveColor: "#6a9ad0",
  },
};

export const componentOrder = [
  "catchment",
  "gutters",
  "downspout",
  "leafFilter",
  "firstFlush",
  "tank",
];
