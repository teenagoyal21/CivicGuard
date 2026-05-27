import { Devvit, useState, useForm, useInterval } from '@devvit/public-api';
import { getPendingFlaggedItems, updateFlaggedItemStatus, getActiveCrisisMode } from './supabase.js';
import { toggleCrisisMode } from './crisis-mode.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

Devvit.addCustomPostType({
  name: 'CivicGuard Dashboard',
  height: 'tall',
  render: (context) => {
    const [itemsJson, setItemsJson] = useState<string>('[]');
    const [loading, setLoading] = useState<boolean>(true);
    const [crisisActive, setCrisisActive] = useState<boolean>(false);
    const [selectedIdx, setSelectedIdx] = useState<number>(0);
    const [actionFeedback, setActionFeedback] = useState<string>('');

    const items: any[] = JSON.parse(itemsJson);

    const loadData = async () => {
      const pendingItems = await getPendingFlaggedItems(context.subredditId, 20);
      setItemsJson(JSON.stringify(pendingItems));
      const crisis = await getActiveCrisisMode(context.subredditId);
      setCrisisActive(crisis !== null);
      setLoading(false);
    };

    const refreshInterval = useInterval(() => {
      void loadData();
    }, 30000);
    refreshInterval.start();

    void loadData();

    const crisisForm = useForm(
      {
        fields: [
          {
            type: 'number',
            name: 'duration',
            label: 'Duration (hours)',
            helpText: 'How long should Crisis Mode stay active?',
          },
          {
            type: 'paragraph',
            name: 'note',
            label: 'Reason (optional)',
          },
        ],
      },
      async (values) => {
        const result = await toggleCrisisMode(
          context.subredditId,
          context.username ?? 'unknown',
          true,
          (values.duration as number) ?? 24,
          values.note as string | undefined,
          context
        );
        setActionFeedback(result.message);
        void loadData();
      }
    );

    const onApprove = async () => {
      const item = items[selectedIdx] as any | undefined;
      if (!item) return;
      await updateFlaggedItemStatus(item.id, 'approved', context.username ?? 'unknown');
      try {
        await context.reddit.approve(item.thing_id);
      } catch (e) {
        console.error('Error approving:', e);
      }
      setActionFeedback('Approved: ' + item.thing_id);
      void loadData();
    };

    const onRemove = async () => {
      const item = items[selectedIdx] as any | undefined;
      if (!item) return;
      await updateFlaggedItemStatus(item.id, 'removed', context.username ?? 'unknown');
      try {
        await context.reddit.remove(item.thing_id, false);
      } catch (e) {
        console.error('Error removing:', e);
      }
      setActionFeedback('Removed: ' + item.thing_id);
      void loadData();
    };

    const onIgnore = async () => {
      const item = items[selectedIdx] as any | undefined;
      if (!item) return;
      await updateFlaggedItemStatus(item.id, 'ignored', context.username ?? 'unknown');
      setActionFeedback('Ignored: ' + item.thing_id);
      void loadData();
    };

    const onDeactivateCrisis = async () => {
      const result = await toggleCrisisMode(
        context.subredditId,
        context.username ?? 'unknown',
        false,
        0,
        undefined,
        context
      );
      setActionFeedback(result.message);
      void loadData();
    };

    if (loading) {
      return (
        <vstack width="100%" height="100%" alignment="middle center" padding="large">
          <text size="xlarge" weight="bold">Loading CivicGuard...</text>
        </vstack>
      );
    }

    const currentItem = items[selectedIdx] as any | undefined;

    return (
      <vstack width="100%" height="100%" padding="medium" gap="small">
        <hstack width="100%" alignment="middle start" gap="small" padding="small">
          <text size="xxlarge" weight="bold" color="#1A5632">CivicGuard</text>
          <spacer size="small" />
          <vstack
            backgroundColor={crisisActive ? '#C0392B' : '#1A5632'}
            cornerRadius="full"
            padding="xsmall"
          >
            <text size="xsmall" weight="bold" color="#FFFFFF">
              {crisisActive ? 'CRISIS MODE ON' : 'ACTIVE'}
            </text>
          </vstack>
          <spacer grow />
          <text size="small" color="#7B8D9E">{items.length} pending</text>
        </hstack>

        <hstack width="100%" gap="small" padding="xsmall">
          {crisisActive ? (
            <button appearance="destructive" size="small" onPress={onDeactivateCrisis}>
              Deactivate Crisis Mode
            </button>
          ) : (
            <button appearance="caution" size="small" onPress={() => context.ui.showForm(crisisForm)}>
              Activate Crisis Mode
            </button>
          )}
        </hstack>

        {items.length === 0 ? (
          <vstack width="100%" height="200px" alignment="middle center" padding="large">
            <text size="xlarge" color="#1A5632" weight="bold">All Clear!</text>
            <text size="medium" color="#7B8D9E">No flagged items in the queue</text>
          </vstack>
        ) : (
          <hstack width="100%" gap="medium" grow>
            <vstack width="45%" gap="small" grow>
              <text size="small" weight="bold" color="#7B8D9E">FLAGGED ITEMS</text>
              {items.slice(0, 8).map((item: any, idx: number) => {
                const isSelected = idx === selectedIdx;
                return (
                  <hstack
                    key={item.id}
                    width="100%"
                    padding="xsmall"
                    gap="small"
                    cornerRadius="small"
                    backgroundColor={isSelected ? '#E8F5E9' : '#F8F9FA'}
                    border={isSelected ? 'thin' : 'none'}
                    borderColor="#1A5632"
                    onPress={() => setSelectedIdx(idx)}
                  >
                    <vstack grow>
                      <text size="xsmall" weight="bold" overflow="ellipsis">
                        {item.thing_type === 'post' ? 'Post' : 'Comment'} by u/{item.author_name ?? 'unknown'}
                      </text>
                      <text size="xsmall" color="#7B8D9E" overflow="ellipsis">
                        Score: {(item.confidence_score * 100).toFixed(0)}%
                      </text>
                    </vstack>
                  </hstack>
                );
              })}
            </vstack>

            <vstack width="55%" gap="small" grow>
              {currentItem ? (
                <>
                  <text size="small" weight="bold" color="#1A5632">FLAG DETAILS</text>
                  <vstack backgroundColor="#F8F9FA" cornerRadius="medium" padding="small" gap="small">
                    <text size="xsmall">
                      Type: {currentItem.thing_type} | Author: u/{currentItem.author_name ?? 'unknown'}
                    </text>
                    <text size="xsmall">
                      Confidence: {(currentItem.confidence_score * 100).toFixed(1)}%
                    </text>
                    <text size="xsmall" color="#7B8D9E">Matched keywords:</text>
                    <text size="xsmall">{(currentItem.matched_keywords ?? []).join(', ')}</text>
                    <text size="xsmall" color="#7B8D9E">Context factors:</text>
                    <text size="xsmall">
                      Age: {currentItem.context_factors?.account_age_days ?? '?'}d |
                      Karma: {currentItem.context_factors?.karma ?? '?'} |
                      Prior: {currentItem.context_factors?.prior_removals ?? 0}
                    </text>
                  </vstack>

                  <hstack width="100%" gap="small" padding="small">
                    <button appearance="success" size="medium" onPress={onApprove} grow>
                      Approve
                    </button>
                    <button appearance="destructive" size="medium" onPress={onRemove} grow>
                      Remove
                    </button>
                    <button appearance="secondary" size="medium" onPress={onIgnore} grow>
                      Ignore
                    </button>
                  </hstack>
                </>
              ) : (
                <vstack alignment="middle center" height="200px">
                  <text color="#7B8D9E">Select an item to view details</text>
                </vstack>
              )}
            </vstack>
          </hstack>
        )}

        {actionFeedback ? (
          <vstack backgroundColor="#E8F5E9" cornerRadius="small" padding="xsmall">
            <text size="xsmall" color="#1A5632">{actionFeedback}</text>
          </vstack>
        ) : null}
      </vstack>
    );
  },
});
