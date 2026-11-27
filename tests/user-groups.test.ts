import test from "node:test";
import assert from "node:assert/strict";
import {
  candidatesFor,
  groupNameTaken,
  memberLabel,
  normalizeGroupName,
  validateGroupName,
  type UserGroup,
} from "../lib/users/groups";
import {
  addDemoGroupMember,
  createDemoGroup,
  deleteDemoGroup,
  listDemoGroups,
  removeDemoGroupMember,
} from "../lib/users/groups-store";

test("group names are trimmed and inner whitespace is collapsed", () => {
  assert.equal(normalizeGroupName("  Service   Desk "), "Service Desk");
  assert.equal(normalizeGroupName("Infrastructure"), "Infrastructure");
});

test("a group name needs 2–60 characters", () => {
  assert.equal(validateGroupName("A"), "Enter a group name.");
  assert.equal(validateGroupName("IT"), null);
  assert.equal(validateGroupName("x".repeat(61)), "Keep the group name under 60 characters.");
});

test("name collisions ignore case and spacing, and honour an excluded id", () => {
  const groups = [
    { id: "g-1", name: "Service Desk" },
    { id: "g-2", name: "Infrastructure" },
  ];

  assert.equal(groupNameTaken(groups, "  service   desk "), true);
  assert.equal(groupNameTaken(groups, "Delivery"), false);
  assert.equal(groupNameTaken(groups, "Service Desk", "g-1"), false);
});

test("member counts read naturally", () => {
  assert.equal(memberLabel({ members: [] }), "No members");
  assert.equal(memberLabel({ members: [{ id: "u-1", name: "A", email: "", role: null }] }), "1 member");
  assert.equal(
    memberLabel({
      members: [
        { id: "u-1", name: "A", email: "", role: null },
        { id: "u-2", name: "B", email: "", role: null },
      ],
    }),
    "2 members",
  );
});

test("candidates exclude current members and sort by name", () => {
  const group = { members: [{ id: "u-1", name: "Meera", email: "", role: null }] };
  const people = [
    { id: "u-3", name: "Zara" },
    { id: "u-2", name: "Arun" },
    { id: "u-1", name: "Meera" },
  ];

  assert.deepEqual(
    candidatesFor(group, people).map((person) => person.id),
    ["u-2", "u-3"],
  );
});

test("the demo store creates groups and edits membership without duplicates", () => {
  const groups = listDemoGroups();
  assert.ok(groups.length >= 3);

  const created = createDemoGroup({ name: "  Security   Ops ", description: "Firewall and endpoint review" });
  assert.equal(created.name, "Security Ops");
  assert.equal(created.members.length, 0);

  assert.equal(addDemoGroupMember(created.id, "u-it-engineer"), true);
  assert.equal(addDemoGroupMember(created.id, "u-it-engineer"), false);
  assert.equal(addDemoGroupMember(created.id, "u-missing"), false);

  const withMember = listDemoGroups().find((group) => group.id === created.id) as UserGroup;
  assert.equal(withMember.members.length, 1);
  assert.equal(withMember.members[0].name, "Arun Prakash");

  assert.equal(removeDemoGroupMember(created.id, "u-it-engineer"), true);
  assert.equal(removeDemoGroupMember(created.id, "u-it-engineer"), false);

  assert.equal(deleteDemoGroup(created.id), true);
  assert.equal(deleteDemoGroup(created.id), false);
  assert.equal(
    listDemoGroups().some((group) => group.id === created.id),
    false,
  );
});

test("unknown groups are ignored", () => {
  assert.equal(addDemoGroupMember("g-missing", "u-it-engineer"), false);
  assert.equal(removeDemoGroupMember("g-missing", "u-it-engineer"), false);
});
