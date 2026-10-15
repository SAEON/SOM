function parseAvailabilityMonths(value) {
 if(value===undefined)return null;
 if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>120)
  throw new Error('monthsBack must be an integer from 1 to 120.');
 return value;
}
module.exports={parseAvailabilityMonths};
