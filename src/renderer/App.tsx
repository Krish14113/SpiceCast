import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import spiceStarLogo from "./assets/spice-star-logo.png";
type Tab =
  "connect" | "contacts" | "lists" | "compose" | "history" | "settings";
const nav: [Tab, string][] = [
  ["connect", "Connect"],
  ["contacts", "Contacts"],
  ["lists", "Lists"],
  ["compose", "Compose"],
  ["history", "History"],
  ["settings", "Settings"],
];
const fmt = (s?: string) => (s ? new Date(s).toLocaleString() : "—");
const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
function useDraftState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}
function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: any) {
  return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="dialog confirmDialog">
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}
export function App() {
  const [tab, setTab] = useState<Tab>("connect"),
    [data, setData] = useState<any>(),
    [wa, setWa] = useState<any>({ state: "idle" }),
    [qr, setQr] = useState(""),
    [job, setJob] = useState<any>({ running: false }),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const jobRef = useRef(job),
    refresh = () => window.api.getData().then(setData);
  const notify = (text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 5000);
  };
  useEffect(() => {
    refresh();
    window.api.waStatus().then(setWa);
    const a = window.api.on("wa:status", setWa),
      b = window.api.on("wa:qr", async (value: string) =>
        setQr(await QRCode.toDataURL(value)),
      ),
      c = window.api.on("send:progress", (value: any) => {
        if (jobRef.current.running && !value.running && value.campaign)
          notify(
            `Sending complete: ${value.campaign.sent} successful, ${value.campaign.failed} failed.`,
            value.campaign.failed > 0,
          );
        jobRef.current = value;
        setJob(value);
      });
    return () => {
      a();
      b();
      c();
    };
  }, []);
  useEffect(() => {
    const reclaimTextInputFocus = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        )
      )
        return;
      window.api.focusWindow();
      window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
    };
    document.addEventListener("pointerdown", reclaimTextInputFocus, true);
    return () =>
      document.removeEventListener("pointerdown", reclaimTextInputFocus, true);
  }, []);
  if (!data) return <main className="loading">Opening workspace…</main>;
  return (
    <div className="app">
      <aside>
        <div
          className="brand"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            paddingBottom: 28,
          }}
        >
          <img
            src={spiceStarLogo}
            alt="Spice Star"
            style={{ width: 200, height: 120, objectFit: "contain" }}
          />
          <strong style={{ fontSize: 21, lineHeight: 1.1 }}>SpiceCast</strong>
          <small style={{ margin: 0, fontSize: 11, lineHeight: 1.2 }}>
            SSFST Broadcast
          </small>
        </div>
        {nav.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div className="sideStatus">
          <i className={wa.state === "ready" ? "good" : ""} />
          {wa.state === "ready" ? "Connected" : "Not connected"}
        </div>
      </aside>
      <main>
        <header>
          <div>
            <h1>{nav.find((x) => x[0] === tab)?.[1]}</h1>
          </div>
          {job.running && (
            <div className="live">
              ● Sending · {job.campaign?.sent + job.campaign?.failed}/
              {job.campaign?.total}
            </div>
          )}
        </header>
        {tab === "connect" && <Connect wa={wa} qr={qr} notify={notify} />}{" "}
        {tab === "contacts" && (
          <Contacts data={data} refresh={refresh} notify={notify} />
        )}{" "}
        {tab === "lists" && (
          <Lists data={data} refresh={refresh} notify={notify} />
        )}{" "}
        {tab === "compose" && <Compose data={data} job={job} notify={notify} />}{" "}
        {tab === "history" && <History />}{" "}
        {tab === "settings" && (
          <Settings data={data} refresh={refresh} notify={notify} />
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.error ? "toastError" : ""}`}>
          {toast.error ? "!" : "✓"} {toast.text}
        </div>
      )}
    </div>
  );
}
function Connect({ wa, qr, notify }: any) {
  return (
    <section className="grid two">
      <div className="card connect">
        <h2>
          {wa.state === "ready" ? "WhatsApp linked" : "Link your WhatsApp"}
        </h2>
        <p>
          {wa.message ||
            "Connect by scanning a QR code from WhatsApp on your phone."}
        </p>
        {wa.state === "qr" && qr && <img className="qr" src={qr} />}{" "}
        {wa.state === "ready" ? (
          <>
            <div className="profile">
              ✓{" "}
              <div>
                <b>{wa.me?.name}</b>
                <small>+{wa.me?.number}</small>
              </div>
            </div>
            <button
              className="danger"
              onClick={async () => {
                await window.api.logout();
                notify("WhatsApp account unlinked.");
              }}
            >
              Unlink WhatsApp
            </button>
          </>
        ) : (
          <button
            className="primary"
            onClick={() => window.api.connect()}
            disabled={wa.state === "launching" || wa.state === "authenticated"}
          >
            {wa.state === "qr"
              ? "Waiting for scan…"
              : wa.state === "launching"
                ? "Launching…"
                : "Connect WhatsApp"}
          </button>
        )}
      </div>
      <div className="card">
        <h2>How to connect?</h2>
        <ol>
          <li>Open WhatsApp on your phone.</li>
          <li>Go to Linked devices → Link a device.</li>
          <li>Scan the QR code shown here.</li>
        </ol>
      </div>
    </section>
  );
}
function Contacts({ data, refresh, notify }: any) {
  const [selected, setSelected] = useDraftState<string[]>(
    "spicecast.contacts.selected",
    [],
  );
  const [query, setQuery] = useState(""),
    [csvRows, setCsvRows] = useState<any[] | null>(null),
    [firstName, setFirstName] = useState(""),
    [lastName, setLastName] = useState(""),
    [phone, setPhone] = useState(""),
    [list, setList] = useState(""),
    [newList, setNewList] = useState(""),
    [formError, setFormError] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const rows = data.contacts
    .filter((c: any) =>
      `${c.name} ${c.phone}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a: any, b: any) =>
        Number(selected.includes(b.id)) - Number(selected.includes(a.id)) ||
        a.name.localeCompare(b.name),
    );
  const saveContact = async (contactToSave?: any) => {
    try {
      const payload = contactToSave || {
        name: `${firstName} ${lastName}`.trim(),
        phone,
        rawPhone: phone,
        groupIds: list ? [list] : [],
      };
      await window.api.saveContact(payload);
      setEditing(null);
      setFirstName("");
      setLastName("");
      setPhone("");
      setFormError("");
      refresh();
      notify(
        contactToSave
          ? "Contact updated successfully."
          : "Contact added successfully.",
      );
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save contact");
      notify("Contact could not be saved.", true);
    }
  };
  const createList = async () => {
    try {
      await window.api.saveGroup({ name: newList });
      setNewList("");
      refresh();
      notify(`List “${newList}” created successfully.`);
    } catch {
      notify("List could not be created.", true);
    }
  };
  const importCsv = async () => {
    const text = await window.api.openCsv();
    if (text) setCsvRows(await window.api.parseCsv(text));
  };
  const allVisibleSelected =
    rows.length > 0 &&
    rows.every((contact: any) => selected.includes(contact.id));
  const toggleAll = () =>
    setSelected((current) =>
      allVisibleSelected
        ? current.filter(
            (id) => !rows.some((contact: any) => contact.id === id),
          )
        : [
            ...new Set([
              ...current,
              ...rows.map((contact: any) => contact.id),
            ]),
          ],
    );
  const beginEdit = (c: any) => {
    const [first, ...rest] = c.name.split(/\s+/);
    setEditing({
      ...c,
      firstName: first,
      lastName: rest.join(" "),
      phone: c.rawPhone || `+${c.phone}`,
    });
  };
  return (
    <section>
      <div className="toolbar">
        <input
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={importCsv}>Import CSV</button>
        <button disabled={!selected.length} onClick={() => setSelected([])}>
          Clear selection
        </button>
        <button
          className="danger"
          disabled={!selected.length}
          onClick={async () => {
            await window.api.deleteContacts(selected);
            setSelected([]);
            refresh();
            notify("Selected contacts deleted.");
          }}
        >
          Delete selected
        </button>
      </div>
      <div className="card">
        <h2>Create a list</h2>
        <p className="muted">
          Lists let you choose a set of contacts quickly when composing a
          broadcast.
        </p>
        <div className="inline">
          <input
            placeholder="Type a name..."
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
          />
          <button
            className="primary"
            onClick={createList}
            disabled={!newList.trim()}
          >
            Create list
          </button>
        </div>
      </div>
      <div className="card contactForm">
        <h2>Add a contact manually</h2>
        <div className="inline">
          <input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <select value={list} onChange={(e) => setList(e.target.value)}>
            <option value="">No list</option>
            {data.groups.map((g: any) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={() => saveContact()}
            disabled={!firstName.trim() || !phone.trim()}
          >
            Add contact
          </button>
        </div>
        {formError && <p className="formError">{formError}</p>}
      </div>
      {selected.length > 0 && (
        <div className="assign">
          <b>
            Add {selected.length} selected contact
            {selected.length === 1 ? "" : "s"} to:
          </b>{" "}
          {data.groups.length ? (
            data.groups.map((g: any) => (
              <button
                key={g.id}
                onClick={async () => {
                  await window.api.assignGroup(selected, g.id);
                  refresh();
                  notify(
                    `${selected.length} contact${selected.length === 1 ? "" : "s"} added to “${g.name}” successfully.`,
                  );
                }}
              >
                {g.name}
              </button>
            ))
          ) : (
            <span> Create a list above first.</span>
          )}
        </div>
      )}
      <div className="table">
        <div className="tr head">
          <input
            title={
              allVisibleSelected ? "Unselect all" : "Select all"
            }
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAll}
          />
          <span>Name</span>
          <span>Phone</span>
          <span>Lists</span>
          <span>Action</span>
        </div>
        {rows.map((c: any) => (
          <div className="tr" key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() =>
                setSelected((x) =>
                  x.includes(c.id)
                    ? x.filter((id) => id !== c.id)
                    : [...x, c.id],
                )
              }
            />
            <b>{c.name}</b>
            <span>+{c.phone}</span>
            <span>
              {c.groupIds
                .map(
                  (id: string) =>
                    data.groups.find((g: any) => g.id === id)?.name,
                )
                .filter(Boolean)
                .join(", ") || "—"}
            </span>
            <button
              className="editButton"
              title={`Edit ${c.name}`}
              onClick={() => beginEdit(c)}
            >
              ✎
            </button>
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            No contacts yet. Import a CSV or add one above.
          </div>
        )}
      </div>
      {editing && (
        <div className="modal">
          <div className="dialog">
            <div className="listHeader">
              <h2>Edit contact</h2>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
            <div className="inline">
              <input
                placeholder="First name"
                value={editing.firstName}
                onChange={(e) =>
                  setEditing({ ...editing, firstName: e.target.value })
                }
              />
              <input
                placeholder="Last name"
                value={editing.lastName}
                onChange={(e) =>
                  setEditing({ ...editing, lastName: e.target.value })
                }
              />
              <input
                placeholder="Phone"
                value={editing.phone}
                onChange={(e) =>
                  setEditing({ ...editing, phone: e.target.value })
                }
              />
            </div>
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  saveContact({
                    ...editing,
                    name: `${editing.firstName} ${editing.lastName}`.trim(),
                    rawPhone: editing.phone,
                  });
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
      {csvRows && (
        <div className="modal">
          <div className="dialog">
            <h2>Import preview</h2>
            <p>
              {csvRows.filter((r) => r.valid).length} valid of {csvRows.length}{" "}
              rows. Invalid rows will be skipped.
            </p>
            <div className="preview">
              {csvRows.slice(0, 12).map((r) => (
                <div
                  key={`${r.index}-${r.rawPhone}`}
                  className={!r.valid ? "bad" : r.duplicate ? "warn" : ""}
                >
                  {r.index}: {r.name || "—"} · {r.rawPhone || "—"}{" "}
                  {r.error || (r.duplicate ? "(existing contact)" : "✓")}
                </div>
              ))}
            </div>
            <div className="actions">
              <button onClick={() => setCsvRows(null)}>Cancel</button>
              <button
                className="primary"
                onClick={async () => {
                  const result = await window.api.commitCsv(csvRows, false);
                  setCsvRows(null);
                  refresh();
                  notify(`${result.added} contacts imported successfully.`);
                }}
              >
                Import, skip duplicates
              </button>
              <button
                onClick={async () => {
                  const result = await window.api.commitCsv(csvRows, true);
                  setCsvRows(null);
                  refresh();
                  notify(
                    `${result.added} contacts imported; existing contacts updated.`,
                  );
                }}
              >
                Update existing
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function Lists({ data, refresh, notify }: any) {
  const [selected, setSelected] = useState(""),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(""),
    [memberQuery, setMemberQuery] = useState(""),
    [confirmingDelete, setConfirmingDelete] = useState(false);
  const list = data.groups.find((g: any) => g.id === selected);
  const members = data.contacts.filter((c: any) =>
    c.groupIds.includes(selected),
  );
  const visibleMembers = members.filter((contact: any) =>
    `${contact.name} ${contact.phone}`
      .toLowerCase()
      .includes(memberQuery.toLowerCase()),
  );
  const rename = async () => {
    if (!list || !name.trim()) return;
    await window.api.saveGroup({
      id: list.id,
      name: name.trim(),
      createdAt: list.createdAt,
    });
    setRenaming(false);
    refresh();
    notify(`List renamed to “${name.trim()}”.`);
  };
  const removeList = async () => {
    if (!list) return;
    const deleted = await window.api.deleteGroup(list.id);
    setSelected("");
    setRenaming(false);
    setConfirmingDelete(false);
    refresh();
    notify(`List “${deleted}” deleted.`);
  };
  return <>
    <section className="grid two">
      <div className="card">
        <h2>Your lists</h2>
        {data.groups.length ? (
          data.groups.map((g: any) => (
            <button
              className={
                selected === g.id ? "listButton selectedList" : "listButton"
              }
              key={g.id}
              onClick={() => {
                setSelected(g.id);
                setRenaming(false);
                setMemberQuery("");
              }}
            >
              {g.name}
              <small>
                {
                  data.contacts.filter((c: any) => c.groupIds.includes(g.id))
                    .length
                }{" "}
                contacts
              </small>
            </button>
          ))
        ) : (
          <p className="muted">No lists yet. Create one in Contacts.</p>
        )}
      </div>
      <div className="card">
        <div className="listHeader">
          <h2>{list ? list.name : "Choose a list"}</h2>
          {list && (
            <span>
              <button
                onClick={() => {
                  setName(list.name);
                  setRenaming(true);
                }}
              >
                Rename
              </button>{" "}
              <button className="danger" onClick={() => setConfirmingDelete(true)}>
                Delete list
              </button>
            </span>
          )}
        </div>
        {list && renaming && (
          <div className="inline">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rename()}
            />
            <button className="primary" onClick={rename}>
              Save name
            </button>
            <button onClick={() => setRenaming(false)}>Cancel</button>
          </div>
        )}
        {list ? (
          <>
            <p className="muted">
              If you remove a contact, it is removed from the list only, not the contacts.
            </p>
            {members.length ? <>
              <input
                className="memberSearch"
                placeholder="Search contacts in this list…"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
              />
              {visibleMembers.length ? (
              <div className="memberList">
                {visibleMembers.map((c: any) => (
                  <div key={c.id}>
                    <span>
                      <b>{c.name}</b>
                      <small>+{c.phone}</small>
                    </span>
                    <button
                      className="danger"
                      onClick={async () => {
                        await window.api.removeGroup(c.id, list.id);
                        refresh();
                        notify(`${c.name} removed from “${list.name}”.`);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No contacts match your search.</p>
            )}
            </> : (
              <p className="muted">This list has no contacts.</p>
            )}
          </>
        ) : (
          <p className="muted">
            Select a list on the left to view and manage its contacts.
          </p>
        )}
      </div>
    </section>
    {confirmingDelete && list && <ConfirmDialog title="Delete list?" message={`Delete “${list.name}”? Its contacts will remain in Contacts.`} confirmLabel="Delete list" danger onConfirm={removeList} onCancel={() => setConfirmingDelete(false)} />}
  </>;
}
function Compose({ data, job, notify }: any) {
  const [lists, setLists] = useDraftState<string[]>(
    "spicecast.compose.lists",
    [],
  );
  const [selectedWaGroups, setSelectedWaGroups] = useDraftState<string[]>(
    "spicecast.compose.whatsapp-groups",
    [],
  );
  const [message, setMessage] = useDraftState(
    "spicecast.compose.message",
    "",
  );
  const [mediaPaths, setMediaPaths] = useDraftState<string[]>(
    "spicecast.compose.media",
    [],
  );
  const [waGroups, setWaGroups] = useState<any[]>([]),
    [picker, setPicker] = useState(false),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmingSend, setConfirmingSend] = useState(false);
  const wasSending = useRef(false);
  useEffect(() => {
    if (job.running) {
      wasSending.current = true;
      return;
    }
    if (wasSending.current && job.campaign?.status === "completed") {
      setLists([]);
      setSelectedWaGroups([]);
      setMessage("");
      setMediaPaths([]);
      setNotice("");
      wasSending.current = false;
    }
  }, [job.running, job.campaign?.status]);
  const recipients = useMemo(
    () =>
      data.contacts.filter(
        (c: any) =>
          lists.length && c.groupIds.some((id: string) => lists.includes(id)),
      ),
    [data, lists],
  );
  const targets = recipients.length + selectedWaGroups.length;
  const visibleGroups = useMemo(
    () =>
      waGroups
        .filter((group) =>
          group.name.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [waGroups, search],
  );
  const chooseMedia = async () => {
    try {
      const paths: string[] = await window.api.openMedia();
      if (!paths?.length) return;
      const combined = [...mediaPaths, ...paths],
        hasPdf = combined.some((path) => path.toLowerCase().endsWith(".pdf")),
        hasNonPdf = combined.some(
          (path) => !path.toLowerCase().endsWith(".pdf"),
        );
      if (combined.length > 10)
        return notify("You can attach up to 10 files.", true);
      if (hasPdf && hasNonPdf)
        return notify("PDFs cannot be mixed with photos or videos.", true);
      setMediaPaths(combined);
      notify(
        `${paths.length} attachment${paths.length === 1 ? "" : "s"} added.`,
      );
    } catch (error) {
      notify(
        `Could not open the media picker: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  };
  const loadWaGroups = async () => {
    try {
      const loaded = await window.api.waGroups();
      setWaGroups(loaded);
      setSearch("");
      setPicker(true);
      notify(
        `${loaded.length} WhatsApp group${loaded.length === 1 ? "" : "s"} loaded.`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };
  const requestStart = () => {
    if (!targets || (!message.trim() && !mediaPaths.length))
      return setNotice(
        "Choose a list or WhatsApp group, and add a message or media file.",
      );
    setConfirmingSend(true);
  };
  const start = async () => {
    setConfirmingSend(false);
    try {
      await window.api.start(
        recipients.map((c: any) => c.id),
        message,
        data.groups
          .filter((g: any) => lists.includes(g.id))
          .map((g: any) => g.name),
        mediaPaths,
        waGroups.filter((group) => selectedWaGroups.includes(group.id)),
      );
      setNotice("Started sending messages.");
      notify("Started sending messages.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      notify("Campaign could not start.", true);
    }
  };
  return (
    <section className="grid compose">
      <div className="card composeCard">
        <div className="sectionHeading">
          <div>
            <span>01</span>
            <h2>Choose your audience</h2>
          </div>
          <div className="audienceCount">{targets} selected</div>
        </div>
        <div className="audienceBlocks">
          <div>
            <h3>Contact lists</h3>
            <p className="muted">
              Select saved contacts from one or more lists.
            </p>
            <div className="checks">
              {data.groups.map((g: any) => (
                <label key={g.id}>
                  <input
                    type="checkbox"
                    checked={lists.includes(g.id)}
                    onChange={() =>
                      setLists((x) =>
                        x.includes(g.id)
                          ? x.filter((id) => id !== g.id)
                          : [...x, g.id],
                      )
                    }
                  />
                  <b>{g.name}</b>
                  <small>
                    {
                      data.contacts.filter((c: any) =>
                        c.groupIds.includes(g.id),
                      ).length
                    }{" "}
                    contacts
                  </small>
                </label>
              ))}
            </div>
          </div>
          <div className="waAudience">
            <div className="waIcon">◉</div>
            <div>
              <h3>WhatsApp groups</h3>
              <p>
                Send directly to groups joined by this linked WhatsApp account.
              </p>
            </div>
            <button className="primary" onClick={loadWaGroups}>
              {waGroups.length ? "Manage groups" : "Browse WhatsApp groups"}
            </button>
          </div>
        </div>
        <div className="selectionSummary">
          <span>{recipients.length} unique contacts</span>
          <i /> <span>{selectedWaGroups.length} WhatsApp groups</span>
        </div>
        <div className="messageSection">
          <div className="sectionHeading">
            <div>
              <span>02</span>
              <h2>Write your message</h2>
            </div>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message…"
            rows={8}
          />
          <div className="media">
            <div>
              <b>Media attachments</b>
              <p className="muted">Up to 10 images/videos, or up to 10 PDFs.</p>
            </div>
            {mediaPaths.length ? (
              <div className="attachmentList">
                {mediaPaths.map((path) => (
                  <div className="attachment" key={path}>
                    📎 {fileName(path)}{" "}
                    <button
                      onClick={() =>
                        setMediaPaths((x) => x.filter((item) => item !== path))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={chooseMedia}
                  disabled={mediaPaths.length >= 10}
                >
                  Add more
                </button>
              </div>
            ) : (
              <button onClick={chooseMedia}>Attach media</button>
            )}
          </div>
        </div>
        <button
          className="primary send"
          onClick={requestStart}
          disabled={job.running || !targets}
        >
          Send message
        </button>
        {notice && <p className="notice">{notice}</p>}
      </div>
      <div className="card deliveryCard">
        <h2>Delivery</h2>
        <p>Sending status will be displayed here.</p>
        {job.running && <Progress job={job} />}
      </div>
      {picker && (
        <div className="modal">
          <div className="dialog groupPicker">
            <div className="listHeader">
              <div>
                <h2>Choose WhatsApp groups</h2>
                <p className="muted">
                  Search and select the groups for this message.
                </p>
              </div>
              <button className="primary" onClick={() => setPicker(false)}>
                Done · {selectedWaGroups.length} selected
              </button>
            </div>
            <input
              autoFocus
              placeholder="Search groups…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="pickerRows">
              {visibleGroups.map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={selectedWaGroups.includes(group.id)}
                    onChange={() =>
                      setSelectedWaGroups((x) =>
                        x.includes(group.id)
                          ? x.filter((id) => id !== group.id)
                          : [...x, group.id],
                      )
                    }
                  />
                  {group.name}
                </label>
              ))}
              {!visibleGroups.length && (
                <p className="muted">No groups match your search.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {confirmingSend && (
        <ConfirmDialog
          title="Send message?"
          message={`Send this message to ${recipients.length} contact${recipients.length === 1 ? "" : "s"} and ${selectedWaGroups.length} WhatsApp group${selectedWaGroups.length === 1 ? "" : "s"}?`}
          confirmLabel="Send message"
          onConfirm={start}
          onCancel={() => setConfirmingSend(false)}
        />
      )}
    </section>
  );
}
function Progress({ job }: any) {
  const c = job.campaign,
    done = (c?.sent || 0) + (c?.failed || 0);
  return (
    <div className="progress">
      <h2>Live progress</h2>
      <div className="bar">
        <i style={{ width: `${c?.total ? (done / c.total) * 100 : 0}%` }} />
      </div>
      <p>
        <b>{c?.sent}</b> sent · <b>{c?.failed}</b> failed ·{" "}
        {Math.max(0, (c?.total || 0) - done)} remaining
      </p>
      <p>
        {job.paused
          ? "Paused"
          : job.countdown
            ? `Next message in ${job.countdown}s`
            : `Sending to ${job.current || "…"}`}
      </p>
      <button
        onClick={() => (job.paused ? window.api.resume() : window.api.pause())}
      >
        {job.paused ? "Resume" : "Pause"}
      </button>{" "}
      <button className="danger" onClick={() => window.api.stop()}>
        Stop
      </button>
    </div>
  );
}
function History() {
  const [campaigns, setCampaigns] = useState<any[]>([]),
    [messages, setMessages] = useState<any[]>([]),
    [open, setOpen] = useState("");
  useEffect(() => {
    window.api.campaigns().then(setCampaigns);
  }, []);
  return (
    <section>
      {!campaigns.length && (
        <div className="empty card">No completed messages yet.</div>
      )}
      {campaigns.map((c) => (
        <div
          className="card campaign"
          key={c.id}
          onClick={async () => {
            setOpen(c.id);
            setMessages(await window.api.messages(c.id));
          }}
        >
          <div>
            <b>{fmt(c.startedAt)}</b>
            <p>{c.messagePreview || "(Media only)"}</p>
            <small>
              {c.hasMedia && `Attachment: ${c.mediaName} · `}
              {c.targetGroupNames.join(", ") || "Direct recipients"}
            </small>
          </div>
          <div className="counts">
            <b>{c.sent} sent</b>
            <span>{c.failed} failed</span>
            <small>{c.status}</small>
          </div>
          {open === c.id && (
            <div className="messageRows">
              {messages.map((m) => (
                <div key={`${m.contactId}-${m.at}`}>
                  {m.status === "sent" ? "✓" : "×"} {m.name} · +{m.phone}{" "}
                  {m.error && `— ${m.error}`}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
function Settings({ data, refresh, notify }: any) {
  const [min, setMin] = useState(data.settings.minDelaySec),
    [max, setMax] = useState(data.settings.maxDelaySec),
    [path, setPath] = useState(data.settings.chromePath || ""),
    [confirmingReset, setConfirmingReset] = useState(false),
    [update, setUpdate] = useState<any>({ state: "idle", message: "Check GitHub Releases for a newer SpiceCast version." });
  useEffect(() => {
    window.api.updateStatus().then(setUpdate);
    return window.api.on("update:status", setUpdate);
  }, []);
  const save = async () => {
    await window.api.saveSettings({
      minDelaySec: Math.max(0, Number(min)),
      maxDelaySec: Math.max(Number(min), Number(max)),
      chromePath: path || undefined,
    });
    refresh();
    notify("Settings saved successfully.");
  };
  const resetLocalData = async () => {
    await window.api.reset();
    setConfirmingReset(false);
    refresh();
    notify("Local contacts and settings cleared.");
  };
  const handleUpdate = async () => {
    if (update.state === "available") return window.api.downloadUpdate();
    if (update.state === "downloaded") return window.api.installUpdate();
    const next = await window.api.checkUpdates();
    if (next) setUpdate(next);
  };
  const updateButton = update.state === "available" ? "Download update" : update.state === "downloaded" ? "Restart and install" : update.state === "checking" ? "Checking…" : update.state === "downloading" ? `Downloading… ${update.percent || 0}%` : "Check for updates";
  return <>
    <section className="grid two">
      <div className="card">
        <h2>Defaults</h2>
        <label>
          Minimum delay (seconds)
          <input
            type="number"
            min="0"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </label>
        <label>
          Maximum delay (seconds)
          <input
            type="number"
            min="0"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
        <label>
          Browser path (optional)
          <input
            value={path}
            placeholder="Leave blank to auto-detect"
            onChange={(e) => setPath(e.target.value)}
          />
        </label>
        <button className="primary" onClick={save}>
          Save settings
        </button>
      </div>
      <div className="card">
        <h2>Data & session</h2>
        <p>
          Contacts, settings, and audit history are stored only on this
          computer.
        </p>
        <button onClick={() => window.api.reveal()}>Reveal data folder</button>
        <hr />
        <h2>Danger zone</h2>
        <p className="muted">
          Clearing data removes local contacts, lists, and settings. Send
          history is retained separately.
        </p>
        <button
          className="danger"
          onClick={() => setConfirmingReset(true)}
        >
          Clear local data
        </button>
      </div>
    </section>
    {confirmingReset && <ConfirmDialog title="Clear local data?" message="Clear local contacts and settings? Send history will be retained separately." confirmLabel="Clear local data" danger onConfirm={resetLocalData} onCancel={() => setConfirmingReset(false)} />}
            <div className="card">
        <h2>App updates</h2>
        <p className="muted">{update.message}</p>
        <button className="primary" onClick={handleUpdate} disabled={update.state === "checking" || update.state === "downloading" || update.state === "unavailable"}>
          {updateButton}
        </button>
      </div>
  </>;
  
}
