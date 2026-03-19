#!/bin/bash
# Self-Improvement Activator Hook
# Triggers on UserPromptSubmit to remind Claude about learning capture
# Keep output minimal (~50-100 tokens) to minimize overhead

# 不使用 set -e，避免意外退出导致 hook error
trap 'exit 0' ERR

# Output reminder as system context
cat << 'EOF'
<self-improvement-reminder>
After completing this task, evaluate if reusable knowledge emerged:
- Non-obvious solution or workaround?
- User correction, preference, or constraint?
- Error that required debugging?
- Repeated workflow worth turning into an instinct?

If yes: Log to .learnings/ using the self-improvement skill format.
If repeated: sync memory and consider instinct/evolve or skill extraction.
</self-improvement-reminder>
EOF

exit 0
