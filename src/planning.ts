import {DHAKA_STUDY_BOUNDARY, type ShelterRegisterEntry} from './dhaka-data.js';

const reviewed=(value: string | null | undefined, now: number) =>
  typeof value==='string' && Number.isFinite(Date.parse(value)) && Date.parse(value)<=now;
const reference=(value: string | null | undefined) => typeof value==='string' && value.trim().length>0;

/** Location/publication eligibility only. Never establishes operational safety. */
export function isShelterMappable(entry: ShelterRegisterEntry, now=Date.now()): boolean {
  const {lat,lng,evidence,geometryReview,publicationReview}=entry;
  const [west,south,east,north]=DHAKA_STUDY_BOUNDARY.bbox;
  return entry.mappable===true && entry.type!=='unreviewed' &&
    typeof lat==='number' && Number.isFinite(lat) && typeof lng==='number' && Number.isFinite(lng) &&
    lng>=west && lng<=east && lat>=south && lat<=north &&
    !!evidence && evidence.evidenceClass!=='unverified_reference' &&
    ['source_geometry','reviewed_geocode','documented_derivation'].includes(evidence.geometryMethod) &&
    ['reviewed','field_verified'].includes(evidence.verificationStatus) &&
    reference(evidence.sourceFeatureId) && /^https?:\/\//.test(evidence.sourceUrl) &&
    reviewed(evidence.retrievedAt,now) &&
    !!geometryReview && reviewed(geometryReview.reviewedAt,now) && reference(geometryReview.reference) &&
    publicationReview?.status==='permitted' && reviewed(publicationReview.reviewedAt,now) && reference(publicationReview.reference);
}

/** Whitelist public fields; pending geometry and reviewer/contact details stay private. */
export function publicShelterRegister(entries: ShelterRegisterEntry[], now=Date.now()) {
  return entries.map(entry=>{
    const mappable=isShelterMappable(entry,now), e=entry.evidence, r=entry.readiness;
    return {
      id:entry.id,name:entry.name,name_bn:entry.name_bn,type:entry.type,
      area:entry.area,area_bn:entry.area_bn,constructedBy:entry.constructedBy,
      constructionYear:entry.constructionYear,coveringPeople:entry.coveringPeople,
      coveringPeopleUnit:entry.coveringPeopleUnit,location:entry.location,
      lat:mappable?entry.lat:null,lng:mappable?entry.lng:null,mappable,
      geometryStatus:mappable?'reviewed-location':'withheld-pending-review',
      evidence:{sourceName:e.sourceName,sourceUrl:e.sourceUrl,sourceFeatureId:e.sourceFeatureId,
        retrievedAt:e.retrievedAt,observedAt:e.observedAt,license:e.license,evidenceClass:e.evidenceClass,
        geometryMethod:e.geometryMethod,positionalAccuracyM:e.positionalAccuracyM,
        verificationStatus:e.verificationStatus,limitations:e.limitations},
      readiness:{operationalStatus:r.operationalStatus,capacityVerified:r.capacityVerified,
        accessibilityReviewed:r.accessibilityReviewed,structuralAssessment:r.structuralAssessment,
        ownerOperatorPermission:r.ownerOperatorPermission,operatingArrangements:r.operatingArrangements,
        reviewedAt:r.reviewedAt,limitations:r.limitations},
    };
  });
}
