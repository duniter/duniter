{% block prerelease %}
# :gift: Pre-release

[Go to Pipeline page :arrow_forward:](https://git.duniter.org/sveyret/duniter/pipelines/{{pipeline}})

{% endblock %}

{% block release %}
# :white_check_mark: Release

{% endblock %}

{% block notebody %}
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
{% endblock %}

{% block previouswiki %}


## {{tag}}

{{body}}
{% endblock %}
