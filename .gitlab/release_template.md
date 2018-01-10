{{current_message}}

# Downloads
{% for artifact in artifacts %}
***
[{{artifact.icon}} {{artifact.name}}]({{artifact.url}})  
_{{artifact.size}}_
***
{% endfor %}
