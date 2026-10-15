/**
 * Fabrication.jsx — Routeur module Fabrication
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { can } from '../services/admin/permissions';
import { formatProfileDisplayName } from '../services/admin/users';
import { useFabrication } from '../hooks/useFabrication';
import './fabrication/fabrication.css';
import FabricationDashboard from './fabrication/FabricationDashboard';
import FabricationList from './fabrication/FabricationList';
import PlansAFabriquer from './fabrication/PlansAFabriquer';
import PlansProjets from './fabrication/PlansProjets';
import LibraryPlanModal from './fabrication/LibraryPlanModal';
import LibraryPlanDetail from './fabrication/LibraryPlanDetail';
import DebuterProductionWizard from './fabrication/DebuterProductionWizard';
import ProgressUpdateModal from './fabrication/ProgressUpdateModal';
import BonsLivraisonFab from './fabrication/BonsLivraisonFab';
import { AffecterAtelierModal, MajProductionModal, PlanDetailModal } from './fabrication/PlanModals';

function FabricationPlansRouter({ tab, onNavigate }) {
  const { user } = useAuth();
  const fab = useFabrication();
  const [preset, setPreset] = useState(null);
  const [perms, setPerms] = useState({
    assign: false, start: false, update: false, libCreate: false, libEdit: false, ready: false,
  });
  const [detail, setDetail] = useState(null);
  const [assignPlan, setAssignPlan] = useState(null);
  const [majPlan, setMajPlan] = useState(null);
  const [progressPlan, setProgressPlan] = useState(null);
  const [libForm, setLibForm] = useState(null);
  const [libDetail, setLibDetail] = useState(null);
  const [wizard, setWizard] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) return;
      const [assign, start, update, libCreate, libEdit] = await Promise.all([
        can(user, 'fabrication-plans', 'valider'),
        can(user, 'fabrication-plans', 'creer'),
        can(user, 'fabrication-suivi', 'modifier'),
        can(user, 'fabrication-plans-projets', 'creer'),
        can(user, 'fabrication-plans-projets', 'modifier'),
      ]);
      if (alive) {
        setPerms({
          assign,
          start: start || assign,
          update,
          libCreate,
          libEdit,
          ready: true,
        });
      }
    })();
    return () => { alive = false; };
  }, [user]);

  const scopedRecords = useCallback((rows) => {
    if (!user?.id) return rows;
    if (!perms.ready || perms.assign) return rows;
    return rows.filter((p) => (
      p.chef_atelier_user_id === user.id || p.transmetteur_id === user.id
    ));
  }, [user, perms.assign, perms.ready]);

  const records = scopedRecords(fab.records);
  const userName = formatProfileDisplayName(user || {}) || user?.email || '';

  async function openDetail(plan) {
    try {
      const full = await fab.fetchOne(plan.id);
      setDetail(full || plan);
    } catch {
      setDetail(plan);
    }
  }

  async function openProductionById(id) {
    setLibDetail(null);
    await openDetail({ id });
  }

  function openLibraryDetail(plan, focus) {
    setLibDetail({ plan, focus: focus || '' });
  }

  function go(target, options = null) {
    if (options?.start) {
      setWizard({ initialPlan: null, draft: null });
      return;
    }
    setPreset(options ? { ...options, target, key: Date.now() } : null);
    if (onNavigate) onNavigate(target);
  }

  useEffect(() => {
    if (preset && preset.target !== tab) setPreset(null);
  }, [tab, preset]);

  const presetFor = (target) => (preset?.target === target ? preset : null);

  async function changeOperationStatut(opId, statut) {
    const res = await fab.setOperationStatut(opId, statut);
    if (res.success && detail?.id) {
      const full = await fab.fetchOne(detail.id).catch(() => null);
      if (full) setDetail(full);
    }
  }

  return (
    <>
      {tab === 'fabrication' && (
        <FabricationDashboard
          records={records}
          library={fab.library}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          onOpenPlan={openDetail}
          onGo={go}
          canStart={perms.start}
        />
      )}
      {tab === 'fabrication-plans-projets' && (
        <PlansProjets
          library={fab.library}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canCreate={perms.libCreate}
          canEdit={perms.libEdit}
          onCreate={() => setLibForm({ plan: null })}
          onEdit={(plan) => setLibForm({ plan })}
          onView={openLibraryDetail}
        />
      )}
      {tab === 'fabrication-plans' && (
        <PlansAFabriquer
          library={fab.library}
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canStart={perms.start}
          canAssign={perms.assign}
          preset={presetFor('fabrication-plans')}
          onStart={(plan) => setWizard({ initialPlan: plan, draft: null })}
          onResumeDraft={async (prod) => {
            const full = await fab.fetchOne(prod.id).catch(() => prod);
            setWizard({ initialPlan: null, draft: full || prod });
          }}
          onViewPlan={openLibraryDetail}
          onViewProduction={openDetail}
          onAssignLegacy={setAssignPlan}
        />
      )}
      {(tab === 'fabrication-suivi' || tab === 'fabrication-terminee') && (
        <FabricationList
          key={tab}
          mode={tab === 'fabrication-suivi' ? 'suivi' : 'termine'}
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canUpdate={perms.update}
          onView={openDetail}
          onUpdate={setMajPlan}
          onProgress={setProgressPlan}
          preset={presetFor(tab)}
        />
      )}

      <PlanDetailModal
        open={Boolean(detail)}
        plan={detail}
        canUpdate={perms.update}
        onOperationStatut={changeOperationStatut}
        onClose={() => setDetail(null)}
      />
      <LibraryPlanDetail
        open={Boolean(libDetail)}
        plan={libDetail?.plan}
        focus={libDetail?.focus}
        canEdit={perms.libEdit}
        canStart={perms.start}
        onClose={() => setLibDetail(null)}
        onEdit={(plan) => { setLibDetail(null); setLibForm({ plan }); }}
        onStart={(plan) => { setLibDetail(null); setWizard({ initialPlan: plan, draft: null }); }}
        onOpenProduction={openProductionById}
      />
      <LibraryPlanModal
        open={Boolean(libForm)}
        plan={libForm?.plan || null}
        projects={fab.projects}
        saving={fab.saving}
        currentUserName={userName}
        onClose={() => setLibForm(null)}
        onSubmit={fab.saveLibraryPlan}
      />
      <DebuterProductionWizard
        open={Boolean(wizard)}
        initialPlan={wizard?.initialPlan || null}
        draft={wizard?.draft || null}
        library={fab.library}
        staff={fab.staff}
        projects={fab.projects}
        saving={fab.saving}
        onClose={() => setWizard(null)}
        onSave={fab.saveProduction}
      />
      <ProgressUpdateModal
        open={Boolean(progressPlan)}
        production={progressPlan}
        saving={fab.saving}
        onClose={() => setProgressPlan(null)}
        onSubmit={fab.recordProgress}
      />
      <AffecterAtelierModal
        open={Boolean(assignPlan)}
        plan={assignPlan}
        users={fab.users}
        saving={fab.saving}
        onClose={() => setAssignPlan(null)}
        onSubmit={fab.assign}
      />
      <MajProductionModal
        open={Boolean(majPlan)}
        plan={majPlan}
        saving={fab.saving}
        onClose={() => setMajPlan(null)}
        onSubmit={fab.updateProduction}
      />
    </>
  );
}

export default function Fabrication({ activeTab, onNavigate }) {
  const tab = activeTab || 'fabrication';

  /* Isolé : Bon de livraison Fabrication (≠ CRM bon-livraison) */
  if (tab === 'fabrication-bons-livraison') {
    return <BonsLivraisonFab />;
  }

  return <FabricationPlansRouter tab={tab} onNavigate={onNavigate} />;
}
