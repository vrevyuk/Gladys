module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('t_user', 'time_format', {
      type: Sequelize.ENUM('auto', '12h', '24h'),
      allowNull: false,
      defaultValue: 'auto',
    });
  },
  down: async (queryInterface, Sequelize) => {},
};
