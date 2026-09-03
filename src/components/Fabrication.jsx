/**
 * Fabrication.jsx — Routeur module Fabrication
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { can } from '../services/admin/permissions';
import { useFabrication } from '../hooks/useFabrication';
import './fabrication/fabrication.css';
import FabricationDashboard from './fabrication/FabricationDashboard';
import FabricationList from './fabrication/FabricationList';
import { AffecterAtelierModal, MajProductionModal, PlanDetailModal } from './fabrication/PlanModals';

export default function Fabrication({ activeTab }) {
  const tab = activeTab || 'fabrication';
  const { user } = useAuth();
  const fab = useFabrication();
  const [canAssign, setCanAssign] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [permsReady, setPermsReady] = useState(false);
  const [detail, setDetail] = useState(null);
  const [assignPlan, setAssignPlan] = useState(null);
  const [majPlan, setMajPlan] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) return;
      const [assign, update] = await Promise.all([
        can(user, 'fabrication-plans', 'valider'),
        can(user, 'fabrication-suivi', 'modifier'),
      ]);
      if (alive) {
        setCanAssign(assign);
        setCanUpdate(update);
        setPermsReady(true);
      }
    })();
    return () => { alive = false; };
  }, [user]);

  const scopedRecords = useCallback((rows) => {
    if (!user?.id) return rows;
    if (!permsReady || canAssign) return rows;
    return rows.filter((p) => (
      p.chef_atelier_user_id === user.id || p.transmetteur_id === user.id
    ));
  }, [user, canAssign, permsReady]);

  const records = scopedRecords(fab.records);

  async function openDetail(plan) {
    try {
      const full = await fab.fetchOne(plan.id);
      setDetail(full || plan);
    } catch {
      setDetail(plan);
    }
  }

  return (
    <>
      {tab === 'fabrication' && (
        <FabricationDashboard
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          onOpenPlan={openDetail}
        />
      )}
      {tab === 'fabrication-plans' && (
        <FabricationList
          mode="inbox"
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canAssign={canAssign}
          canUpdate={canUpdate}
          onView={openDetail}
          onAssign={setAssignPlan}
          onUpdate={setMajPlan}
        />
      )}
      {tab === 'fabrication-suivi' && (
        <FabricationList
          mode="suivi"
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canAssign={canAssign}
          canUpdate={canUpdate}
          onView={openDetail}
          onAssign={setAssignPlan}
          onUpdate={setMajPlan}
        />
      )}
      {tab === 'fabrication-terminee' && (
        <FabricationList
          mode="termine"
          records={records}
          loading={fab.loading}
          error={fab.error}
          onReload={fab.load}
          canAssign={canAssign}
          canUpdate={canUpdate}
          onView={openDetail}
          onAssign={setAssignPlan}
          onUpdate={setMajPlan}
        />
      )}

      <PlanDetailModal open={Boolean(detail)} plan={detail} onClose={() => setDetail(null)} />
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
