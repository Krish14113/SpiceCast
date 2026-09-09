import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import spiceStarLogo from "./assets/spice-star-logo.png";
type Tab =
  "connect" | "contacts" | "lists" | "compose" | "history" | "settings";
const nav: [Tab, string][] = [
  ["connect", "Connect"],
  ["contacts", "Contacts"],
  ["lists", "Broadcasts"],
  ["compose", "Compose"],
  ["history", "History"],
  ["settings", "Settings"],
];
const fmt = (s?: string) => (s ? new Date(s).toLocaleString() : "—");
const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
const runtimeDrafts = new Map<string, unknown>();
const sortLists = (groups: any[]) =>
  [...groups].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
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
function useRuntimeDraftState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() =>
    runtimeDrafts.has(key) ? (runtimeDrafts.get(key) as T) : initialValue,
  );
  useEffect(() => {
    runtimeDrafts.set(key, value);
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
    [accountId, setAccountId] = useDraftState("spicecast.selected-account", "primary"),
    [accountDialogOpen, setAccountDialogOpen] = useState(false),
    [accountName, setAccountName] = useState(""),
    [renamingAccountId, setRenamingAccountId] = useState(""),
    [renamedAccountName, setRenamedAccountName] = useState(""),
    [deletingAccount, setDeletingAccount] = useState<any>(null),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const jobRef = useRef(job),
    accountIdRef = useRef(accountId),
    refresh = () => window.api.getData().then(setData);
  const notify = (text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 5000);
  };
  useEffect(() => {
    refresh();
    const a = window.api.on("wa:status", (value: any) => {
        if (value.accountId === accountIdRef.current) setWa(value.status);
      }),
      b = window.api.on("wa:qr", async (value: any) => {
        if (value.accountId === accountIdRef.current)
          setQr(await QRCode.toDataURL(value.qr));
      }),
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
    accountIdRef.current = accountId;
    setQr("");
    window.api.waStatus(accountId).then(setWa);
  }, [accountId]);
  useEffect(() => {
    if (data?.accounts?.length && !data.accounts.some((account: any) => account.id === accountId))
      setAccountId(data.accounts[0].id);
  }, [data, accountId, setAccountId]);
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
  const accounts = data.accounts || [{ id: "primary", name: "Primary" }];
  const account = accounts.find((item: any) => item.id === accountId) || accounts[0];
  const addAccount = async () => {
    try {
      const created = await window.api.saveAccount({ name: accountName });
      setAccountName("");
      setAccountDialogOpen(false);
      setAccountId(created.id);
      refresh();
      notify(`Account “${created.name}” added. Connect it by scanning its QR code.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account could not be added.", true);
    }
  };
  const renameAccount = async () => {
    if (!renamingAccountId) return;
    try {
      const renamed = await window.api.renameAccount(renamingAccountId, renamedAccountName);
      setRenamingAccountId("");
      setRenamedAccountName("");
      refresh();
      notify(`Account renamed to “${renamed.name}”.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Account could not be renamed.", true);
    }
  };
  const deleteAccount = async () => {
    if (!deletingAccount) return;
    try {
      const nextAccount = accounts.find((item: any) => item.id !== deletingAccount.id);
      const deleted = await window.api.deleteAccount(deletingAccount.id);
      if (account.id === deletingAccount.id && nextAccount) setAccountId(nextAccount.id);
      setDeletingAccount(null);
      refresh();
      notify(`Account “${deleted}” deleted and unlinked.`);
    } catch (error) {
      setDeletingAccount(null);
      notify(error instanceof Error ? error.message : "Account could not be deleted.", true);
    }
  };
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
          {wa.state === "ready" ? `${account.name} connected` : `${account.name} not connected`}
        </div>
      </aside>
      <main>
        <header>
          <div>
            <h1>{nav.find((x) => x[0] === tab)?.[1]}</h1>
          </div>
          <div className="headerControls">
            <label className="accountSelect">
              <span>Sending account</span>
              <select value={account.id} onChange={(event) => setAccountId(event.target.value)} disabled={job.running}>
                {accounts.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button onClick={() => setAccountDialogOpen(true)} disabled={job.running}>Manage accounts</button>
            {job.running && (
              <div className="live">
                ● Sending · {job.campaign?.sent + job.campaign?.failed}/
                {job.campaign?.total}
              </div>
            )}
          </div>
        </header>
        {tab === "connect" && <Connect account={account} wa={wa} qr={qr} notify={notify} />}{" "}
        {tab === "contacts" && (
          <Contacts data={data} refresh={refresh} notify={notify} />
        )}{" "}
        {tab === "lists" && (
          <Lists data={data} refresh={refresh} notify={notify} />
        )}{" "}
        {tab === "compose" && <Compose key={account.id} account={account} data={data} job={job} notify={notify} />}{" "}
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
      {accountDialogOpen && (
        <div className="modal">
          <div className="dialog accountDialog">
            <h2>Manage sending accounts</h2>
            <p className="muted">Each account has its own WhatsApp login. Contacts, Broadcasts, settings, and history stay shared.</p>
            <div className="accountRows">
              {accounts.map((item: any) => <div className="accountRow" key={item.id}>
                {renamingAccountId === item.id ? <input autoFocus value={renamedAccountName} onChange={(event) => setRenamedAccountName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && renameAccount()} /> : <span><b>{item.name}</b>{item.id === account.id && <small>Selected</small>}</span>}
                <div>{renamingAccountId === item.id ? <><button onClick={() => { setRenamingAccountId(""); setRenamedAccountName(""); }}>Cancel</button><button className="primary" disabled={!renamedAccountName.trim()} onClick={renameAccount}>Save</button></> : <><button onClick={() => { setRenamingAccountId(item.id); setRenamedAccountName(item.name); }}>Rename</button><button className="danger" disabled={accounts.length <= 1} onClick={() => setDeletingAccount(item)}>Delete</button></>}</div>
              </div>)}
            </div>
            <h3>Add another account</h3>
            <p className="muted">Give it a label, then connect it by scanning its QR code.</p>
            <input placeholder="Label" value={accountName} onChange={(event) => setAccountName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addAccount()} />
            <div className="actions"><button onClick={() => { setAccountDialogOpen(false); setAccountName(""); setRenamingAccountId(""); }}>Close</button><button className="primary" disabled={!accountName.trim()} onClick={addAccount}>Add account</button></div>
          </div>
        </div>
      )}
      {deletingAccount && <ConfirmDialog title="Delete sending account?" message={`Delete “${deletingAccount.name}” and remove its saved WhatsApp login from the app? Shared contacts, Broadcasts, settings, and history will not be changed.`} confirmLabel="Delete account" danger onConfirm={deleteAccount} onCancel={() => setDeletingAccount(null)} />}
    </div>
  );
}
function Connect({ account, wa, qr, notify }: any) {
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
        <p className="accountNotice">Account: <b>{account.name}</b></p>
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
                await window.api.logout(account.id);
                notify(`${account.name} unlinked from WhatsApp.`);
              }}
            >
              Unlink WhatsApp
            </button>
          </>
        ) : (
          <button
            className="primary"
            onClick={() => window.api.connect(account.id)}
            disabled={wa.state === "launching" || wa.state === "authenticated"}
          >
            {wa.state === "qr"
              ? "Waiting for scan…"
              : wa.state === "launching"
                ? "Launching…"
                : `Connect ${account.name}`}
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
    [listId, setListId] = useState(""),
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
        groupIds: listId ? [listId] : [],
      };
      await window.api.saveContact(payload);
      setEditing(null);
      setFirstName("");
      setLastName("");
      setPhone("");
      setListId("");
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
          <select value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">No broadcast</option>
            {sortLists(data.groups).map((group: any) => (
              <option key={group.id} value={group.id}>
                {group.name}
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
          <span>Broadcasts</span>
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
            <span className="contactLists">
              {sortLists(
                data.groups.filter((group: any) => c.groupIds.includes(group.id)),
              )
                .map((group: any) => group.name)
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
    [createOpen, setCreateOpen] = useState(false),
    [newListName, setNewListName] = useState(""),
    [pickerOpen, setPickerOpen] = useState(false),
    [pickerQuery, setPickerQuery] = useState(""),
    [pickedContactIds, setPickedContactIds] = useState<string[]>([]),
    [confirmingDelete, setConfirmingDelete] = useState(false);
  const orderedLists = sortLists(data.groups);
  const list = data.groups.find((g: any) => g.id === selected);
  const members = data.contacts.filter((c: any) => c.groupIds.includes(selected));
  const visibleMembers = members.filter((contact: any) =>
    `${contact.name} ${contact.phone}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );
  const pickerContacts = data.contacts
    .filter((contact: any) => `${contact.name} ${contact.phone}`.toLowerCase().includes(pickerQuery.toLowerCase()))
    .sort((a: any, b: any) => {
      const aIsMember = Boolean(list && a.groupIds.includes(list.id));
      const bIsMember = Boolean(list && b.groupIds.includes(list.id));
      return Number(bIsMember) - Number(aIsMember) || a.name.localeCompare(b.name);
    });
  const rename = async () => {
    if (!list || !name.trim()) return;
    await window.api.saveGroup({ id: list.id, name: name.trim(), createdAt: list.createdAt });
    setRenaming(false);
    refresh();
      notify(`Broadcast renamed to “${name.trim()}”.`);
  };
  const createList = async () => {
    if (!newListName.trim()) return;
    try {
      const created = await window.api.saveGroup({ name: newListName.trim() });
      setSelected(created.id);
      setNewListName("");
      setCreateOpen(false);
      refresh();
      notify(`Broadcast “${created.name}” created successfully.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Broadcast could not be created.", true);
    }
  };
  const openPicker = () => {
    setPickerQuery("");
    setPickedContactIds(members.map((contact: any) => contact.id));
    setPickerOpen(true);
  };
  const addPickedContacts = async () => {
    if (!list) return;
    const newContactIds = pickedContactIds.filter((id) => !members.some((contact: any) => contact.id === id));
    if (!newContactIds.length) {
      setPickerOpen(false);
      return;
    }
    await window.api.assignGroup(newContactIds, list.id);
    setPickerOpen(false);
    setPickedContactIds([]);
    refresh();
    notify(`${newContactIds.length} contact${newContactIds.length === 1 ? "" : "s"} added to “${list.name}” successfully.`);
  };
  const moveList = async (groupId: string, direction: -1 | 1) => {
    const from = orderedLists.findIndex((group: any) => group.id === groupId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedLists.length) return;
    const reordered = [...orderedLists];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    await window.api.reorderGroups(reordered.map((group: any) => group.id));
    refresh();
  };
  const removeList = async () => {
    if (!list) return;
    const deleted = await window.api.deleteGroup(list.id);
    setSelected("");
    setRenaming(false);
    setConfirmingDelete(false);
    refresh();
    notify(`Broadcast “${deleted}” deleted.`);
  };
  return <>
    <section className="grid two">
      <div className="card">
        <div className="listHeader">
          <h2>Your broadcasts</h2>
          <button className="primary" onClick={() => setCreateOpen(true)}>New broadcast</button>
        </div>
        {orderedLists.length ? orderedLists.map((group: any, index: number) => (
          <div className={selected === group.id ? "listButton selectedList" : "listButton"} key={group.id}>
            <button className="listSelect" onClick={() => { setSelected(group.id); setRenaming(false); setMemberQuery(""); }}>
              <b>{group.name}</b>
              <small>{data.contacts.filter((contact: any) => contact.groupIds.includes(group.id)).length} contacts</small>
            </button>
            <div className="listOrder" aria-label={`Move ${group.name}`}>
              <button title="Move up" aria-label={`Move ${group.name} up`} disabled={index === 0} onClick={() => moveList(group.id, -1)}>↑</button>
              <button title="Move down" aria-label={`Move ${group.name} down`} disabled={index === orderedLists.length - 1} onClick={() => moveList(group.id, 1)}>↓</button>
            </div>
          </div>
        )) : <p className="muted">No broadcasts yet. Create your first broadcast here.</p>}
      </div>
      <div className="card">
        <div className="listHeader">
          <h2>{list ? list.name : "Choose a broadcast"}</h2>
          {list && <span>
            <button onClick={openPicker}>Add contacts</button>{" "}
            <button onClick={() => { setName(list.name); setRenaming(true); }}>Rename</button>{" "}
            <button className="danger" onClick={() => setConfirmingDelete(true)}>Delete broadcast</button>
          </span>}
        </div>
        {list && renaming && <div className="inline">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && rename()} />
          <button className="primary" onClick={rename}>Save name</button>
          <button onClick={() => setRenaming(false)}>Cancel</button>
        </div>}
        {list ? <>
          <p className="muted">Add existing contacts to this broadcast, or remove them without deleting them from Contacts.</p>
          {members.length ? <>
            <input className="memberSearch" placeholder="Search contacts in this broadcast…" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} />
            {visibleMembers.length ? <div className="memberList">
              {visibleMembers.map((contact: any) => <div key={contact.id}>
                <span><b>{contact.name}</b><small>+{contact.phone}</small></span>
                <button className="danger" onClick={async () => { await window.api.removeGroup(contact.id, list.id); refresh(); notify(`${contact.name} removed from “${list.name}”.`); }}>Remove</button>
              </div>)}
            </div> : <p className="muted">No contacts match your search.</p>}
          </> : <p className="muted">This broadcast has no contacts yet. Use Add contacts above to get started.</p>}
        </> : <p className="muted">Select a broadcast on the left to view and manage its contacts.</p>}
      </div>
    </section>
    {createOpen && <div className="modal"><div className="dialog compactDialog">
      <h2>Create a broadcast</h2>
      <p className="muted">Give this broadcast a name to proceed adding contacts.</p>
      <input autoFocus placeholder="Broadcast name" value={newListName} onChange={(event) => setNewListName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createList()} />
      <div className="actions"><button onClick={() => { setCreateOpen(false); setNewListName(""); }}>Cancel</button><button className="primary" disabled={!newListName.trim()} onClick={createList}>Create broadcast</button></div>
    </div></div>}
    {pickerOpen && list && <div className="modal"><div className="dialog contactPicker">
      <div className="listHeader"><div><h2>Add contacts to {list.name}</h2><p className="muted">Search your contacts, select one or more, then save.</p></div></div>
      <input autoFocus placeholder="Search contacts…" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} />
      <div className="pickerRows contactPickerRows">
        {pickerContacts.map((contact: any) => { const isMember = contact.groupIds.includes(list.id); return <label className={isMember ? "existingMember" : ""} key={contact.id}><input type="checkbox" checked={pickedContactIds.includes(contact.id)} disabled={isMember} onChange={() => setPickedContactIds((current) => current.includes(contact.id) ? current.filter((id) => id !== contact.id) : [...current, contact.id])} /><b>{contact.name}</b>{isMember && <em>Added</em>}<small>+{contact.phone}</small></label>; })}
        {!pickerContacts.length && <p className="muted">No contacts match your search.</p>}
      </div>
      <div className="actions"><button onClick={() => setPickerOpen(false)}>Cancel</button><button className="primary" disabled={!pickedContactIds.some((id) => !members.some((contact: any) => contact.id === id))} onClick={addPickedContacts}>Save selection</button></div>
    </div></div>}
    {confirmingDelete && list && <ConfirmDialog title="Delete broadcast?" message={`Delete “${list.name}”? Its contacts will remain in Contacts.`} confirmLabel="Delete broadcast" danger onConfirm={removeList} onCancel={() => setConfirmingDelete(false)} />}
  </>;
}
function Compose({ account, data, job, notify }: any) {
  const [lists, setLists] = useRuntimeDraftState<string[]>(
    "spicecast.compose.lists",
    [],
  );
  const [selectedWaGroups, setSelectedWaGroups] = useRuntimeDraftState<string[]>(
    `spicecast.compose.whatsapp-groups.${account.id}`,
    [],
  );
  const [message, setMessage] = useRuntimeDraftState(
    "spicecast.compose.message",
    "",
  );
  const [mediaPaths, setMediaPaths] = useRuntimeDraftState<string[]>(
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
      const loaded = await window.api.waGroups(account.id);
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
        "Choose a broadcast or WhatsApp group, and add a message or media file.",
      );
    setConfirmingSend(true);
  };
  const start = async () => {
    setConfirmingSend(false);
    try {
      await window.api.start(
        account.id,
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
            <h3>Contact broadcasts</h3>
            <p className="muted">
              Select saved contacts from one or more broadcasts.
            </p>
            <div className="checks">
              {sortLists(data.groups).map((g: any) => (
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
                Send directly to groups joined by {account.name}.
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
          message={`Send this message from ${account.name} to ${recipients.length} contact${recipients.length === 1 ? "" : "s"} and ${selectedWaGroups.length} WhatsApp group${selectedWaGroups.length === 1 ? "" : "s"}?`}
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
  const eta = Math.max(0, Math.round(job.etaSeconds || 0));
  const etaLabel = eta >= 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;
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
      <p className="muted">Estimated time remaining: about {etaLabel}</p>
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
    [selectedCampaign, setSelectedCampaign] = useState<any>(null),
    [showRecipients, setShowRecipients] = useState(false),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    window.api.campaigns().then(setCampaigns);
  }, []);
  const openCampaign = async (campaign: any) => {
    setSelectedCampaign(campaign);
    setShowRecipients(false);
    await refreshCampaign(campaign);
  };
  const refreshCampaign = async (campaign: any) => {
    setLoading(true);
    try { setMessages(await window.api.messages(campaign.id)); } finally { setLoading(false); }
  };
  return (
    <section>
      <div className="historyHeading">
        <div><h2>All past messages</h2><p className="muted">Open a message to view its full content and recipient results.</p></div>
      </div>
      {!campaigns.length && (
        <div className="empty card">No past messages yet.</div>
      )}
      {campaigns.map((c) => (
        <button className="card historyCampaign" key={c.id} onClick={() => openCampaign(c)}>
          <div className="historyCampaignTop">
            <span className={c.status === "completed" ? "campaignStatus completed" : "campaignStatus stopped"}>{c.status === "completed" ? "Completed" : "Stopped"}</span>
            <span>{new Date(c.startedAt).toLocaleDateString()} · {new Date(c.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <p className="historyPreview">{c.message || c.messagePreview || "(Media only message)"}</p>
          <div className="historyMeta"><span><b>{c.total}</b> recipients</span><span><b>{c.sent + c.failed}</b> sent</span><span className="success"><b>{c.sent}</b> successful</span><span className="failure"><b>{c.failed}</b> failed</span></div>
          <small>{c.targetGroupNames.join(", ") || "Direct recipients"}</small>
        </button>
      ))}
      {selectedCampaign && <div className="modal"><div className="dialog historyDialog">
        <div className="listHeader"><div><h2>Message details</h2><p className="muted">{fmt(selectedCampaign.startedAt)} · {selectedCampaign.status === "completed" ? "Completed" : "Stopped"}</p></div><button onClick={() => { setSelectedCampaign(null); setMessages([]); }}>Close</button></div>
        <div className="historyMessage"><b>Message</b><p>{selectedCampaign.message || selectedCampaign.messagePreview || "(Media only message)"}</p>{selectedCampaign.hasMedia && <small>Attachment: {selectedCampaign.mediaName}</small>}</div>
        <div className="performanceGrid"><div><span>Recipients</span><b>{selectedCampaign.total}</b></div><div><span>Successful</span><b className="success">{selectedCampaign.sent}</b></div><div><span>Failed</span><b className="failure">{selectedCampaign.failed}</b></div></div><br/>
        <button className="primary recipientButton" onClick={() => setShowRecipients((current) => !current)} disabled={loading}>{loading ? "Loading recipients…" : showRecipients ? `Hide recipients (${messages.length})` : `View recipients (${selectedCampaign.total})`}</button>
        {showRecipients && <div className="recipientResults">{messages.map((message) => <div className={message.status === "sent" ? "recipientSuccess" : "recipientFailure"} key={`${message.contactId}-${message.at}`}><span><b>{message.name}</b><small>+{message.phone}</small></span><span>{message.status === "sent" ? "Sent" : "Failed"}{message.error && <small>{message.error}</small>}</span></div>)}{!messages.length && !loading && <p className="muted">No recipient records are available for this older message.</p>}</div>}
      </div></div>}
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
          Clearing data removes local contacts, broadcasts, and settings. Send
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
