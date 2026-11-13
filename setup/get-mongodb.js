// npm run get-mongodb: downloads MongoDB for the practice server (one time per computer)
import { MongoBinary } from "mongodb-memory-server";

console.log("Downloading MongoDB. This is big. Leave this terminal open until it says DONE.");
const where = await MongoBinary.getPath();
console.log("DONE. MongoDB is saved at:");
console.log(where);
console.log("Next: npm start");
