import { useState } from "react";
import { LayoutGrid, PencilLine, Plus, Trash2 } from "lucide-react";
import { Button, ErrorBox, FormError, Loading, Modal, ModalFooter, PageBody, PageHeader, Table, TextInput, useApi, toast } from "../../components/ui.jsx";
import { api } from "../../api.js";

export default function Categories() {
  const { data, error, reload } = useApi("/categories");
  const [edit, setEdit] = useState(null); // { id?, name }
  const [del, setDel] = useState(null);

  const doDelete = async () => {
    try {
      await api(`/categories/${del.id}`, { method: "DELETE" });
      toast.success("Category deleted");
      setDel(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader icon={LayoutGrid} title="Categories" subtitle="Shown on the rep home screen and as search filters" crumbs={[{ label: "Content" }, { label: "Categories" }]}>
        <Button icon={Plus} onClick={() => setEdit({ name: "" })}>
          Add category
        </Button>
      </PageHeader>
      <PageBody>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {!data && !error && <Loading />}
        {data && (
          <Table
            rows={data}
            empty="No categories yet."
            columns={[
              { key: "name", header: "Category", render: (c) => <b className="font-semibold text-slate-900">{c.name}</b> },
              { key: "productCount", header: "Products", className: "tabular" },
              { key: "publishedCount", header: "Published", className: "tabular" },
              {
                key: "act",
                header: "",
                align: "right",
                render: (c) => (
                  <span className="inline-flex gap-1.5">
                    <Button size="sm" variant="secondary" icon={PencilLine} onClick={() => setEdit({ id: c.id, name: c.name })}>
                      Rename
                    </Button>
                    <Button size="sm" variant="danger-soft" icon={Trash2} disabled={c.productCount > 0} title={c.productCount ? "Move products out first" : undefined} onClick={() => setDel(c)}>
                      Delete
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </PageBody>
      {edit && (
        <CategoryModal
          initial={edit}
          onClose={() => setEdit(null)}
          onSaved={(msg) => {
            setEdit(null);
            toast.success(msg);
            reload();
          }}
        />
      )}
      {del && (
        <Modal title="Delete category" size="sm" onClose={() => setDel(null)} footer={<ModalFooter onCancel={() => setDel(null)} onSave={doDelete} saveLabel="Delete" saveVariant="danger" />}>
          <p className="text-sm text-slate-600">
            Delete the category <b>{del.name}</b>? This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}

function CategoryModal({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial.name);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return setErr("Enter a category name.");
    setBusy(true);
    try {
      if (initial.id) await api(`/categories/${initial.id}`, { method: "PUT", body: { name } });
      else await api("/categories", { method: "POST", body: { name } });
      onSaved(initial.id ? "Category renamed" : "Category added");
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={initial.id ? "Rename category" : "Add category"} size="sm" onClose={onClose} footer={<ModalFooter onCancel={onClose} onSave={save} saving={busy} saveLabel={initial.id ? "Save" : "Add category"} />}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <TextInput label="Category name" placeholder="e.g. Ice Cream Freezer" value={name} onChange={(e) => setName(e.target.value)} />
        <FormError message={err} />
      </form>
    </Modal>
  );
}
