import mongoose from "mongoose";

export const defaultServices = [
  { id: "haircut", name: "Haircut", minutes: 25 },
  { id: "beard", name: "Beard Shaving", minutes: 15 },
  { id: "combo", name: "Hair + Beard", minutes: 35 },
  { id: "colour", name: "Hair Colour", minutes: 45 },
];

const serviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    minutes: { type: Number, required: true, min: 1, max: 240 },
  },
  { _id: false, id: false },
);

const shopSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    chairs: { type: Number, required: true, min: 1, max: 20, default: 1 },
    services: { type: [serviceSchema], default: () => defaultServices },
    tokenDay: String,
    lastToken: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Shop = mongoose.model("Shop", shopSchema);
