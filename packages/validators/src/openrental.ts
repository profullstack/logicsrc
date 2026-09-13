import type { ErrorObject } from "ajv";

type MemberReference = { kind: "openagent" | "openswarm"; id: string };

// Called only after the JSON Schema has checked the shape. Keep the checks
// which need sibling values here; uniqueItems cannot enforce identity when
// two entries have different URLs or metadata.
type FleetReferences = {
  members: MemberReference[];
  rentals?: Array<{
    id: string;
    scope: { kind: "listing" } | { kind: "members"; members: MemberReference[] };
    minimum_units?: number;
    maximum_units?: number;
    valid_from?: string;
    valid_until?: string;
  }>;
};

function memberKey(member: MemberReference): string {
  return JSON.stringify([member.kind, member.id]);
}

export function validateOpenRentalReferences(data: unknown): ErrorObject[] {
  const listing = data as FleetReferences;
  const errors: ErrorObject[] = [];
  function report(keyword: string, instancePath: string, message: string) {
    errors.push({ keyword, instancePath, schemaPath: "#/openrental-semantics", params: {}, message });
  }

  const members = new Set<string>();
  listing.members.forEach((member, i) => {
    const key = memberKey(member);
    if (members.has(key)) {
      report("uniqueMember", `/members/${i}`, "duplicates an existing member kind and id");
    }
    members.add(key);
  });

  const rentals = new Set<string>();
  listing.rentals?.forEach((rental, i) => {
    const path = `/rentals/${i}`;
    if (rentals.has(rental.id)) {
      report("uniqueRental", `${path}/id`, "duplicates an existing rental id");
    }
    rentals.add(rental.id);

    if (rental.scope.kind === "members") {
      const scopedMembers = new Set<string>();
      rental.scope.members.forEach((member, j) => {
        const key = memberKey(member);
        const memberPath = `${path}/scope/members/${j}`;
        if (!members.has(key)) {
          report("memberReference", memberPath, "must reference a member of this listing by kind and id");
        }
        if (scopedMembers.has(key)) {
          report("uniqueMember", memberPath, "duplicates a member in this rental scope");
        }
        scopedMembers.add(key);
      });
    }

    if (rental.maximum_units !== undefined && rental.maximum_units < (rental.minimum_units ?? 1)) {
      report("rentalUnits", `${path}/maximum_units`, "must be at least minimum_units");
    }
    if (rental.valid_from && rental.valid_until && Date.parse(rental.valid_from) >= Date.parse(rental.valid_until)) {
      report("rentalPeriod", `${path}/valid_until`, "must be later than valid_from");
    }
  });

  return errors;
}
