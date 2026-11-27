"use client";

import { type FormEvent, useState } from "react";
import { nominalRebarMass } from "../../../lib/construction-quality.ts";
import { circularArea, rectangularConcreteVolume, requiredBarCount, siValue, specimenStrength, utilization } from "../../../lib/professional/engineering.ts";

const results = new Intl.NumberFormat("en",{ maximumFractionDigits:6 });
const unitList = ["mm","m","kg","t","L","m³"] as const;
const instruments = {
  reinforcement: { title:"Reinforcement area, nominal mass and bar count", fields:["Diameter (mm)","Bar length (m)","Bar count","Total required straight length (m)"], formula:
    "Circular area = π d² / 4. Nominal mass uses 7,850 kg/m³. Estimated count rounds the length ratio up before cutting or lap allowances." },
  concrete: { title:"Rectangular concrete volume", fields:["Length (m)","Width or section breadth (m)","Depth or section height (m)","Number of identical elements"], formula:
    "Length × breadth × depth × count. Use for rectangular footings, columns, beams or slabs before deducting voids and applying allowances." },
  strength: { title:"Concrete specimen compressive strength", fields:["Failure load (kN)","Loaded face breadth or diameter (mm)","Second loaded face dimension (mm)"], formula:
    "Failure load in newtons divided by loaded area in mm² gives MPa. Cylinders use circular area. Cube results use the two measured loaded-face dimensions." },
  stock: { title:"Material utilization", fields:["Accepted quantity","Allocated quantity"], formula:
    "Utilization = allocated ÷ accepted × 100. Use the same unit for both inputs. Remaining quantity is accepted less allocated." },
  conversion: { title:"SI unit conversion", fields:["Quantity"], formula:"Convert within one physical quantity using SI scale factors." },
} as const;
type Instrument = keyof typeof instruments;

export function Calculator() {
  const [tool,setTool] = useState<Instrument>("reinforcement");
  const [answer,setAnswer] = useState("");
  const [error,setError] = useState("");
  const current = instruments[tool];
  function run(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnswer(""); setError("");
    const form = new FormData(event.currentTarget);
    const num = (i:number) => Number(form.get("value-"+i));
    const fmt = (x:number) => results.format(x);
    try {
      if (tool === "reinforcement") {
        const mass = nominalRebarMass(num(0),num(1),num(2));
        setAnswer(`${fmt(circularArea(num(0)))} mm² · ${fmt(mass.kgPerM)} kg/m · ${fmt(mass.totalKg)} kg · ${requiredBarCount(num(3),num(1))} bars by straight length`);
      } else if (tool === "concrete") {
        setAnswer(`${fmt(rectangularConcreteVolume(num(0),num(1),num(2),num(3)))} m³`);
      } else if (tool === "strength") {
        const shape = form.get("shape") === "cylinder" ? "cylinder" : "cube";
        const strength = specimenStrength(num(0),shape,num(1),form.get("value-2") ? num(2) : undefined);
        setAnswer(`${fmt(strength.strengthMpa)} MPa · Loaded area ${fmt(strength.areaMm2)} mm²`);
      } else if (tool === "stock") {
        const value = utilization(num(0),num(1));
        setAnswer(`${fmt(value.percent)}% allocated · ${fmt(value.remaining)} in the entered unit remaining`);
      } else {
        const from = form.get("from") as typeof unitList[number], to = form.get("to") as typeof unitList[number];
        setAnswer(`${fmt(siValue(num(0),from,to))} ${to}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the input values."); }
  }
  return <section className="live-panel">
    <label>Calculation <select value={tool} onChange={(event) => { setTool(event.target.value as Instrument); setAnswer(""); setError(""); }}>
      {Object.entries(instruments).map(([key,value]) => <option key={key} value={key}>{value.title}</option>)}
    </select></label>
    <p>{current.formula}</p>
    <form onSubmit={run} key={tool}>
      {current.fields.map((label,index) => <label key={label}>{label}<input type="number" step="any" min="0" name={`value-${index}`}
        required={tool !== "strength" || index !== 2} /></label>)}
      {tool === "strength" && <label>Specimen shape <select name="shape"><option value="cube">Cube</option><option value="cylinder">Cylinder</option></select></label>}
      {tool === "conversion" && ["from","to"].map((field) => <label key={field}>{field === "from" ? "From" : "To"}
        <select name={field}>{unitList.map((unit) => <option key={unit}>{unit}</option>)}</select></label>)}
      <button>Calculate</button>
    </form>
    {answer && <p role="status">{answer}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
