import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = {
  title: "OpenFleet · LogicSRC",
  description:
    "OpenFleet is the record an agent session carries about where it sits: which human answers for it, who spawned it, for what task, at what depth and under what ceiling. A fleet is every session one human is answerable for; a swarm is the sessions one spawner starts inside it to do one task. Fleets are always human controlled.",
  alternates: { canonical: "/openfleet" }
};

const RECORD = `{
  "openfleet": "0.1",
  "fleet": "anthony@dev",
  "sysop": "anthony@dev",
  "member": "create-two-0541-1",
  "parent": "460a4502",
  "swarm": "create-two-0541",
  "task": "create two ...",
  "piece": { "title": "create hello.sh bash", "owns": ["hello.sh"] },
  "depth": 1,
  "engine": "claude-code",
  "host": "dev",
  "cwd": "/home/anthony/.claude/jobs/460a4502/tmp/swarm-live",
  "started": "2026-09-13T05:41:01Z",
  "approvals": "bypass",
  "ceiling": { "approvals": "bypass", "depth": 1, "fan_out": 4,
               "hosts": ["dev"], "until": "2026-09-13T06:11:01Z" }
}`;

const LEDGER = `{"at":"2026-09-13T05:41:01Z","event":"swarm.spawn","fleet":"anthony@dev","host":"dev","by":"460a4502",
 "swarm":"create-two-0541","task":"create two ...","ceiling":{"fan_out":4,"until":"2026-09-13T06:11:01Z"},
 "pieces":[{"member":"create-two-0541-1","title":"create hello.sh bash","owns":["hello.sh"]},
           {"member":"create-two-0541-2","title":"create bye.sh bash","owns":["bye.sh"]}]}
{"at":"2026-09-13T05:41:12Z","event":"member.start","fleet":"anthony@dev","host":"dev","by":"create-two-0541-1",
 "member":"create-two-0541-1","session":"172ffd83","swarm":"create-two-0541","parent":"460a4502","depth":1,
 "engine":"claude-code","cwd":"/home/anthony/.claude/jobs/460a4502/tmp/swarm-live","approvals":"bypass",
 "piece":{"title":"create hello.sh bash","owns":["hello.sh"]}}
{"at":"2026-09-13T05:41:36Z","event":"member.end","fleet":"anthony@dev","host":"dev","by":"create-two-0541-1",
 "member":"create-two-0541-1","state":"done","summary":"Created hello.sh, mode -rwxrwxr-x, prints hello."}`;

const TREE = `$ logicsrc fleet tree
anthony@dev  (implicit fleet, sysop anthony@dev, depth 1, hosts dev)
└─ 460a4502  ultracode mode documentation                claude-code      working  [bypass]
   ├─ swarm 460a4502-1  claude -p "Split the task below into at most 4 ..."  1 member  done
   │  └─ (its session id)                                   claude-p         done
   └─ swarm create-two-0541  "create two ..."             2/4 members      until 06:11
      ├─ create-two-0541-1 (172ffd83)  create hello.sh bash  claude-code      done  [bypass]  owns hello.sh
      └─ create-two-0541-2             create bye.sh bash    moshcode/claude  done  [bypass]  owns bye.sh`;

const STEPS: Array<[string, string]> = [
  ["1. A human opens a fleet", "Or does nothing, and gets the implicit fleet user@host with a ceiling of depth 1 and no fleet-level approvals: each session the human starts by hand runs its subtree under the approvals it was started with. Only a human opens a fleet or sets its ceiling. A process that carries OPENFLEET_MEMBER is an agent, and the tool refuses it."],
  ["2. An agent spawns a swarm", "It mints a swarm id, writes swarm.spawn to the fleet's ledger with the task, the ceiling it narrowed to, and one piece per member with the paths that member owns, as data. It never widens the ceiling it inherited."],
  ["3. The starter writes the record, the session claims it", "Before each member starts: one JSON file under ~/.openfleet, its path in OPENFLEET_RECORD, copies of fleet, member and swarm in three more variables. The session that starts under an unclaimed record claims it by writing member.start. One that inherits an already claimed record derives its own child record, so the leak becomes a parent pointer."],
  ["4. Everyone reads the same tree", "logicsrc fleet tree and moshcode fleet tree fold the ledger and the records into one tree: fleet, swarms, members, state, spend against budget, and a mark on every member running with approvals bypassed. The engine rosters, claude agents and moshcode herd ps, add liveness and the members that have no record."],
  ["5. The sysop stops or caps as one unit", "stop on a swarm ends every member through its own engine and writes one swarm.end. cap narrows a fleet or a running swarm, and anything already above the new ceiling is stopped. log says afterwards what happened and who did it."]
];

const VERBS: Array<[string, string, string]> = [
  ["open", "sysop only", "mint a fleet, name the human, set the ceiling, write fleet.open"],
  ["cap", "sysop only", "set a fleet's ceiling or narrow a running swarm's; stop whatever is now above it"],
  ["tree", "anyone", "the fleet as a tree, from the ledger and the records, with liveness and recordless members from the engine rosters it can read"],
  ["stop", "within reach", "end a member, a swarm, or a whole fleet as one unit; an agent reaches only what it spawned"],
  ["log", "anyone", "the ledger for a fleet, a swarm or a member: what happened, who did it, what it cost"]
];

const ABSENT: Array<[string, string]> = [
  ["No orchestration", "It does not split a task, route a model, pick an engine, verify or synthesise. moshcode swarm and @logicsrc/agentswarm do that and keep their names."],
  ["No permission system", "approvals and piece.owns are carried and honoured by engines. Enforcement is theirs; the ledger makes what they did checkable."],
  ["No transcript, no message bus", "What a member said stays in the engine's own log. Siblings learn each other's ids from the ledger."],
  ["No replacement roster", "~/.claude/jobs and ~/.moshcode/herd stay. The record and the ledger are the layer that reads across them."],
  ["No network surface in 0.1", "Files on one host, under one account, merged by hand across hosts. A descriptor and an API are the 0.2 question."],
  ["No freeze", "There is no engine-neutral way to freeze a member, so there is no hold. stop ends; cap narrows what may start next."],
  ["No signature", "The human-only test is an environment variable and the ledger is the audit. Signed fleet.open and fleet.cap are the 0.2 answer."]
];

export default function OpenFleetPage(): ReactNode {
  return (
    <SiteShell active="OpenFleet">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenFleet</h2>
          <p>
            Agents under a human. One record per session says who spawned it, for what and under
            what ceiling; one ledger per fleet says what happened and whether a person or an
            agent did it.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          A <strong>fleet</strong> is every agent session one human, its sysop, is answerable
          for. A <strong>swarm</strong> is the set of sessions one spawner starts inside a fleet
          to do one task. Fleets are always human controlled: only a human opens one or sets its
          ceiling, and no agent is ever a sysop. Swarms are automated by default: an agent starts
          one, and the record and the ledger are what let the human see the tree, stop the swarm
          as one unit, and learn afterwards what the agent did.
        </p>
        <p style={{ color: "#41505d" }}>
          It exists because on 2026-09-13 a Claude Code background job on a Profullstack
          developer machine, the host <code style={mono}>dev</code> in the record below, asked
          moshcode to split a task across two agents. One worker became a Claude Code job, the
          other a tmux pane. Both ran with their approval prompts bypassed, because the agent that
          spawned them chose to. Neither could say who had started it, why, who its sibling was,
          what its budget was, or which human had approved any of it. What each might touch was one sentence in a
          prompt that nothing stored or checked. The human could not see the tree or stop the
          pair as one thing. Each tool kept a flat, private roster. The relationship existed in a
          process tree and in a prompt, and was recorded nowhere.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Not <Link href="/openswarm">OpenSwarm</Link>, whose swarm is a BitTorrent
          swarm of peers serving pieces of a file. Not a server fleet either: a host is where a
          member runs, never a fleet.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five steps</h2>
        </div>
        <table style={table}>
          <tbody>
            {STEPS.map(([what, how]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The record</h2>
          <p>
            What moshcode should have written for the first piece that morning, and what Claude
            Code job <code style={mono}>172ffd83</code> then claimed. Written before the member
            starts, never changed after, readable by the member, by any other process of the same
            account, and by whoever inspects it later.
          </p>
        </div>
        <pre style={pre}>{RECORD}</pre>
        <p style={{ color: "#41505d" }}>
          The smallest valid record is four keys: <code style={mono}>openfleet</code>,{" "}
          <code style={mono}>fleet</code>, <code style={mono}>sysop</code> and{" "}
          <code style={mono}>member</code>. A member with no record at all is a root member of
          the implicit fleet <code style={mono}>user@host</code>, never an error. It lives at{" "}
          <code style={mono}>~/.openfleet/fleets/&lt;fleet&gt;/members/&lt;member&gt;.json</code>,
          and its path is <code style={mono}>OPENFLEET_RECORD</code> in the member&apos;s
          environment. A record is unclaimed until a session writes its{" "}
          <code style={mono}>member.start</code>; the session that does so runs as that member,
          and its own id, here the job id, arrives in that line as{" "}
          <code style={mono}>session</code>. A process that carries{" "}
          <code style={mono}>OPENFLEET_MEMBER</code> is an agent; that one test is what keeps{" "}
          <code style={mono}>open</code> and <code style={mono}>cap</code> in human hands, and the
          ledger is the audit behind it.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The ledger</h2>
          <p>
            One append-only JSON Lines file per fleet per host. Every line says who did it:{" "}
            <code style={mono}>sysop</code> for the human, a member id for an agent. A tool never
            writes <code style={mono}>sysop</code> for something an agent did. Lines are wrapped
            here for width; each is one line in the file.
          </p>
        </div>
        <pre style={pre}>{LEDGER}</pre>
        <p style={{ color: "#41505d" }}>
          Eight events: <code style={mono}>fleet.open</code>, <code style={mono}>fleet.cap</code>,{" "}
          <code style={mono}>swarm.spawn</code>, <code style={mono}>member.start</code>,{" "}
          <code style={mono}>member.spend</code>, <code style={mono}>member.end</code>,{" "}
          <code style={mono}>swarm.end</code> and <code style={mono}>ceiling.refuse</code>. The
          last one is how a sysop finds out what an agent tried: an engine that refuses to start
          a member above the ceiling names the key it refused on.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The tree</h2>
          <p>
            Folded from the ledger and the records. An engine&apos;s own roster adds liveness, and
            is the only place a member with no record exists.
          </p>
        </div>
        <pre style={pre}>{TREE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Five verbs</h2>
          <p>
            <code style={mono}>logicsrc fleet</code> ships them in{" "}
            <code style={mono}>@logicsrc/openfleet</code> 0.1.0 (logicsrc CLI 0.3.0) and{" "}
            <code style={mono}>moshcode fleet</code> in moshcode 0.99.0, each able to stop the
            members its own engine runs. Claude Code joins through{" "}
            <code style={mono}>logicsrc fleet hooks install</code>, which makes every session a
            recorded member; its own <code style={mono}>claude agents</code> view does not offer the
            verbs yet.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>verb</th>
              <th style={th}>who</th>
              <th style={th}>does</th>
            </tr>
          </thead>
          <tbody>
            {VERBS.map(([verb, who, does]) => (
              <tr key={verb}>
                <td style={td}>
                  <code style={mono}>{verb}</code>
                </td>
                <td style={td}>{who}</td>
                <td style={td}>{does}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openfleet">Specification</Link>: the terms, the record, the
            environment, claiming and deriving, the ledger&apos;s eight events, five verbs, fifteen
            rules, the worked example, and what Claude Code and moshcode each add
          </li>
          <li>
            <Link href="/asdlc">ASDLC</Link>: a swarm is one fan-out made durable;{" "}
            <code style={mono}>piece.owns</code> is the no-shared-files rule as data
          </li>
          <li>
            <Link href="/openaccess">OpenAccess</Link>, whose limit string the budget uses;{" "}
            <Link href="/openprofile">OpenProfile.md</Link>, the sysop where the human has one;{" "}
            <Link href="/openswarm">OpenSwarm</Link>, the other swarm
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
