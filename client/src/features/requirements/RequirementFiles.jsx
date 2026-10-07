import Attachments from '../comments/Attachments.jsx';
import { useRequirementList } from './useRequirementList.js';

// Files attached to a requirement (briefs, references). canEdit: requirement editors, who delete anyone's files.
export default function RequirementFiles({ requirementId, canEdit }) {
  const { items: files, error, setError, act } = useRequirementList(requirementId, 'attachments');
  return (
    <>
      {error && <div className="error">{error}</div>}
      <Attachments
        files={files}
        uploadPath={`/requirements/${requirementId}/attachments`}
        canDeleteAll={canEdit}
        act={act}
        onError={setError}
      />
    </>
  );
}
