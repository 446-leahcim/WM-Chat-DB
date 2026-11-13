// npm run check-mongodb: is the practice MongoDB already downloaded on this computer?
import { DryMongoBinary } from "mongodb-memory-server";

const options = await DryMongoBinary.generateOptions();
const downloaded = await DryMongoBinary.locateBinary(options);

if (downloaded) {
  console.log("YES: the practice MongoDB is already downloaded on this computer.");
  console.log("Skip npm run get-mongodb. Go straight to npm start.");
} else {
  console.log("NO: the practice MongoDB is not on this computer yet.");
  console.log("Run: npm run get-mongodb   (a big download: wait until it says DONE)");
}
