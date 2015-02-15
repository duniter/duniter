module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-contrib-watch')

  // Configuration de Grunt
  grunt.initConfig({

    watch: {
      web: {
        files: 'web/public/**',
        options: {
          livereload: true
        }
      }
    }
  })

  // Définition des tâches Grunt
  grunt.registerTask('default', '')

}