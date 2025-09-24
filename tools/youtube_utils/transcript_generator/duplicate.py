from typing import List


def remove_sentence_repeats(text: str) -> str:
    """Collapse any sentence that is repeated consecutively into a single instance."""
    lines = text.splitlines()

    def is_repeated(idx: int, lines: List[str]) -> bool:
        """Check if the line is a repeat of the previous one."""
        try:
            length_idx = len(lines[idx])
            length_forword = len(lines[idx + 1])

            if length_idx < length_forword:
                if lines[idx] == lines[idx + 1][:length_idx]:
                    return True

        except IndexError:
            return False

        return False

    out_lines = [lines[i] for i in range(len(lines)) if not is_repeated(i, lines)]

    return "\n".join(out_lines)
