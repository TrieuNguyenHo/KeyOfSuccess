import CommentList, { CommentComposer } from '../comments/CommentList.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';
import { useRequirementList } from './useRequirementList.js';

// A requirement's comments; new ones from someone else show up without reopening it.
// canEdit: requirement editors, who may also delete files others sent with their comments.
export default function RequirementComments({ requirementId, canEdit, onChanged }) {
  const { items: comments, error, setError, act } = useRequirementList(requirementId, 'comments', onChanged);
  // People who can open the project, i.e. who can be tagged in this requirement's comments.
  const mentionable = useFetched(`/requirements/${requirementId}/mentionable`);

  return (
    <>
      <h3>
        Comments <span className="muted">{comments.length}</span>
      </h3>
      {error && <div className="error">{error}</div>}
      <CommentList
        comments={comments}
        kind="requirement-comments"
        mentionable={mentionable}
        empty={tr('Chưa có comments.')}
        act={act}
        canDeleteFiles={canEdit}
        onError={setError}
      />
      <CommentComposer
        kind="requirement-comments"
        createPath={`/requirements/${requirementId}/comments`}
        mentionable={mentionable}
        placeholder={tr('Gõ @ để nhắc ai đó, dán ảnh hoặc bấm 📎 để đính kèm')}
        act={act}
        onError={setError}
      />
    </>
  );
}
