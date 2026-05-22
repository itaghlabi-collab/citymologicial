/**
 * Documents.jsx — Routeur principal module GED ERP CITYMO
 * Expose 4 sous-modules : Mes documents / Partagés / Liens publics / Corbeille
 */

import MesDocuments from './documents/MesDocuments.jsx';
import DocsPartages from './documents/DocsPartages.jsx';
import LiensPublics from './documents/LiensPublics.jsx';
import Corbeille    from './documents/Corbeille.jsx';

/**
 * activeTab: 'mes-documents' | 'docs-partages' | 'liens-publics' | 'corbeille'
 */
export default function Documents({ activeTab }) {
  const tab = activeTab || 'mes-documents';
  return (
    <div>
      {tab === 'mes-documents'  && <MesDocuments />}
      {tab === 'docs-partages'  && <DocsPartages />}
      {tab === 'liens-publics'  && <LiensPublics />}
      {tab === 'corbeille'      && <Corbeille    />}
    </div>
  );
}
