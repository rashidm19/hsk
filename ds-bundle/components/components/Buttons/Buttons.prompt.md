# Buttons & CTA — HSK Prep

Base class `.btn` + one variant. All are real site classes from `_ds_bundle.css`.

```html
<button class="btn btn-primary">Start mock exam</button>   <!-- terracotta, main CTA -->
<button class="btn btn-secondary">Review answers</button>  <!-- soft parchment -->
<button class="btn btn-ghost">Skip for now</button>        <!-- outline -->
<button class="btn btn-jade">Continue</button>             <!-- green / success -->
<button class="btn btn-primary btn-block">Full width</button>
```

- Buttons work on `<button>` and `<a>` alike; min touch target is built in (`--tap` 44px).
- `.cta-banner` — inverted (dark) call-to-action block. `.cta-link` is the tertiary link
  beneath the primary button INSIDE such inverted blocks (it uses `--invert-fg`, so it is
  invisible on light backgrounds — never use it outside a dark/inverted container).
- One `.btn-primary` per view section; secondary actions use `.btn-secondary`/`.btn-ghost`.
