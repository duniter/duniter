<placeholder content="end-title" />
<placeholder content="note">
{{current_message}}
</placeholder>

## Downloads

| Category | Arch | Type | Size | File |
|----------|------|------|------|------|
{% for artifact in artifacts %}
| {{artifact.category}} | {{artifact.arch}} | {{artifact.type}} | {{artifact.size}} | [{{artifact.icon}} {{artifact.name}}]({{artifact.url}}) |
{% endfor %}
