// Synthetic publication data with the maintained identities and source envelopes.
// Numerical values are test fixtures, never production fallback observations.
import { DOMAINS } from '../../src/satellite.ts';
import { readingsFromMeasurements } from '../../src/collage.ts';
import { PUBLICATION_DISTRICT_IDS, PUBLICATION_INSTRUMENTS } from '../../src/publication-contract.ts';

export function refreshPublicationReadings(data) {
  const readings=readingsFromMeasurements(new Map(data.districts.map(place=>[place.id,place.measurements])),data.districts.map(place=>place.id));
  for(const place of data.districts)place.readings=readings.get(place.id);
  return data;
}
export function makePublicationFixture({ timestamp = new Date().toISOString(), observationDate = timestamp.slice(0,10) } = {}) {
  const values=[0.05,300,295,0.1,0.25,0,4.5];
  return refreshPublicationReadings({status:'ok',timestamp,provenance:'mixed',city:'Dhaka',domains:structuredClone(DOMAINS),
    corridors:[{id:'stored-corridor',status:'ok',night_radiance_nw:0}],measured:98,total:98,reasonCode:null,
    districts:PUBLICATION_DISTRICT_IDS.map(id=>({id,lat:23.8,lng:90.4,name:id,name_bn:'স্থান',category:'',headline:'',headline_bn:'',readings:[],
      measurements:PUBLICATION_INSTRUMENTS.map((spec,j)=>({layerId:spec.id,label:spec.id,label_bn:'পাঠ',domain:spec.domain,status:'ok',value:values[j],min:values[j],max:values[j],mean:values[j],unit:spec.unit,
        observationDate:spec.static||spec.domain==='energy'?null:observationDate,period:spec.domain==='energy'?'January 2001 - December 2025':null,vintage:spec.static?'2010':null,
        static:spec.static,censored:false,provenance:spec.provenance,source:spec.domain==='energy'?'NASA POWER Climatology API · SYN1DEG':'NASA GIBS',sourceUrl:`https://${spec.sourceHost}/`,coverage:spec.domain==='energy'?null:1,samples:spec.domain==='energy'?0:25,
        resolutionM:spec.domain==='energy'?null:1000,windowM:spec.domain==='energy'?null:5000,reasonCode:null,
        sampling:{type:spec.domain==='energy'?'model-point':'point-window',radiusPx:spec.domain==='energy'?null:2,bbox:spec.domain==='energy'?null:[90.39,23.79,90.41,23.81],scope:'fixture window'}}))}))});
}

