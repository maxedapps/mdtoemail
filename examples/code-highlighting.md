# Opt-in code highlighting

This warning-free fixture demonstrates the fixed syntax-highlighting profile.

## TypeScript with highlighted lines and line numbers

```ts {2,4-6} lineNumbers
interface Recipient {
  name: string;
  email: string;
}

const recipient: Recipient = {
  name: "Miyuki 🌸",
  email: "miyuki@example.com",
};

const boundary = "verified"; // this line is exactly eighty display columns wide
log(recipient.name);
```

## Python without line numbers

```python
def greeting(name: str) -> str:
    message = f"Hello, {name}!"

    return message

print(greeting("Zoë"))
```

## Escaped HTML-like source

```html
<section data-message="A&B">
  <p>Use <strong>escaped</strong> markup.</p>
  <script>
    alert("not executable");
  </script>
</section>
```
